import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function loadTsModule(path) {
  const mod = await import(path);
  return mod.default ?? mod;
}

const {
  createBundleFromDirectory,
  createBundleFromFileMap,
  validateUploadedTarball,
} = await loadTsModule('../src/lib/floom/bundle.ts');
const { runInSandboxContained } = await loadTsModule('../src/lib/e2b/runner.ts');
const {
  reconcileQuotaReservation,
  recordQuotaUsage,
  reserveDailyQuota,
} = await loadTsModule('../src/lib/floom/quota.ts');
const {
  isLegacyPythonManifest,
  parseManifest,
  resolveManifestDisplayName,
  resolvePythonDependencyConfig,
  validatePythonSourceForManifest,
} = await loadTsModule('../src/lib/floom/manifest.ts');
const { validatePythonRequirementsText } = await loadTsModule('../src/lib/floom/requirements.ts');
const { floomTools, callFloomTool } = await loadTsModule('../src/lib/mcp/tools.ts');

function parseToolResult(result) {
  return JSON.parse(result.content[0].text);
}

async function test() {
  testManifestModes();
  testRequirementsValidation();
  await testBundleValidation();
  await testMalformedTarballRejection();
  await testTemplateBundles();
  testMeetingActionItemsLegacyWrapper();
  await testFakeRunner();
  await testQuotaRpcContract();
  await testMcpContract();
  testDocsAndSpecs();
  testMigration();
}

function testMeetingActionItemsLegacyWrapper() {
  const tmp = mkdtempSync(join(tmpdir(), 'floom-meeting-legacy-'));
  try {
    const source = readFileSync('templates/meeting-action-items/app.py', 'utf8');
    writeFileSync(join(tmp, 'app.py'), source);
    writeFileSync(join(tmp, 'inputs.json'), JSON.stringify({
      transcript: [
        'Action: Sarah sends launch notes by Friday',
        'Marcus owns beta checklist tomorrow',
        'Anna will run demo QA before launch',
      ].join('\n'),
      default_owner: '',
    }));
    writeFileSync(join(tmp, 'runner.py'), [
      'import json',
      'import sys',
      `sys.path.insert(0, ${JSON.stringify(tmp)})`,
      'from app import run',
      '',
      `with open(${JSON.stringify(join(tmp, 'inputs.json'))}) as handle:`,
      '    inputs = json.load(handle)',
      'result = run(inputs)',
      `with open(${JSON.stringify(join(tmp, 'output.json'))}, "w") as handle:`,
      '    json.dump(result, handle)',
      '',
    ].join('\n'));
    execFileSync('python3', [join(tmp, 'runner.py')], { stdio: 'pipe' });
    const output = JSON.parse(readFileSync(join(tmp, 'output.json'), 'utf8'));
    assert.equal(output.count, 3);
    assert.deepEqual(output.items.map((item) => item.owner), ['Sarah', 'Marcus', 'Anna']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function testManifestModes() {
  const stockManifest = parseManifest({
    slug: 'stock-app',
    public: true,
    input_schema: './input.schema.json',
    output_schema: './output.schema.json',
    secrets: ['OPENAI_API_KEY'],
  });
  assert.equal(stockManifest.mode, 'stock_e2b');
  assert.equal(stockManifest.command, undefined);
  assert.equal(resolveManifestDisplayName(stockManifest), 'Stock App');

  const commandManifest = parseManifest({
    name: 'Node Fetch',
    slug: 'node-fetch',
    command: 'node index.js',
    dependencies: { python: './requirements.txt --require-hashes' },
  });
  assert.equal(commandManifest.mode, 'stock_e2b');
  assert.deepEqual(resolvePythonDependencyConfig(commandManifest), {
    path: 'requirements.txt',
    requireHashes: true,
  });

  const legacyManifest = parseManifest({
    name: 'Legacy App',
    slug: 'legacy-app',
    runtime: 'python',
    entrypoint: 'app.py',
    handler: 'run',
    dependencies: { python: './requirements.txt' },
  });
  assert.equal(legacyManifest.mode, 'legacy_python');
  assert.equal(isLegacyPythonManifest(legacyManifest), true);
  assert.deepEqual(resolvePythonDependencyConfig(legacyManifest), {
    path: 'requirements.txt',
    requireHashes: true,
  });
  validatePythonSourceForManifest('def run(inputs):\n    return {"ok": True}\n', legacyManifest);
  assert.throws(
    () => validatePythonSourceForManifest('def other(inputs):\n    return {}\n', legacyManifest),
    /handler function/
  );

  assert.throws(
    () => parseManifest({ slug: 'bad-app', command: 'python app.py', runtime: 'python', entrypoint: 'app.py', handler: 'run' }),
    /either command/
  );
}

function testRequirementsValidation() {
  const relaxed = validatePythonRequirementsText('requests==2.32.3\npydantic==2.12.3\n');
  assert.match(relaxed, /requests==2\.32\.3/);
  assert.match(relaxed, /pydantic==2\.12\.3/);

  const hashed = validatePythonRequirementsText(
    'humanize==4.9.0 --hash=sha256:ce284a76d5b1377fd8836733b983bfb0b76f1aa1c090de2566fcf008d7f6ab16\n',
    { requireHashes: true }
  );
  assert.match(hashed, /--hash=sha256:/);

  assert.throws(
    () => validatePythonRequirementsText('requests>=2.0\n', { requireHashes: true }),
    /sha256 hashes/
  );
  assert.throws(
    () => validatePythonRequirementsText('git+https://github.com/example/repo.git\n'),
    /must not use URLs/
  );
}

async function testBundleValidation() {
  const tmp = mkdtempSync(join(tmpdir(), 'floom-stock-bundle-'));
  try {
    writeFileSync(join(tmp, 'floom.yaml'), ['slug: stock-test', 'public: true'].join('\n'));
    writeFileSync(join(tmp, 'app.py'), 'print("hello")\n');
    mkdirSync(join(tmp, 'node_modules'));
    writeFileSync(join(tmp, 'node_modules', 'ignored.js'), 'ignored');
    writeFileSync(join(tmp, '.env.local'), 'SECRET=1');

    const bundle = await createBundleFromDirectory(tmp);
    assert.ok(bundle.files.includes('floom.yaml'));
    assert.ok(bundle.files.includes('app.py'));
    assert.ok(!bundle.files.includes('node_modules/ignored.js'));
    assert.ok(!bundle.files.includes('.env.local'));

    const validated = await validateUploadedTarball(bundle.buffer);
    assert.equal(validated.command, 'python app.py');
    assert.equal(validated.runtimeLabel, 'python');
    assert.equal(validated.inputSchema, null);
    assert.equal(validated.outputSchema, null);
    await validated.cleanup();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const warningBundle = await createBundleFromFileMap({
    'floom.yaml': ['slug: warning-app', 'public: true'].join('\n'),
    'app.py': [
      'import os',
      'print(os.getenv("MISSING_SECRET"))',
    ].join('\n'),
  });
  const warningValidated = await validateUploadedTarball(warningBundle.buffer);
  assert.match(warningValidated.warnings.join('\n'), /MISSING_SECRET/);
  await warningValidated.cleanup();

  const commandBundle = await createBundleFromFileMap({
    'floom.yaml': ['slug: explicit-command', 'command: python worker.py'].join('\n'),
    'worker.py': 'print({"ok": True})\n',
  });
  const commandValidated = await validateUploadedTarball(commandBundle.buffer);
  assert.equal(commandValidated.command, 'python worker.py');
  assert.equal(commandValidated.runtimeLabel, 'python');
  await commandValidated.cleanup();

  const ambiguousBundle = await createBundleFromFileMap({
    'floom.yaml': 'slug: ambiguous-command\n',
    'app.py': 'print("python")\n',
    'index.js': 'console.log("node")\n',
    'package.json': JSON.stringify({ scripts: { start: 'node index.js' } }),
  });
  await assert.rejects(
    () => validateUploadedTarball(ambiguousBundle.buffer),
    /ambiguous command auto-detection/
  );

  const ambiguousPackageBundle = await createBundleFromFileMap({
    'floom.yaml': 'slug: ambiguous-package-command\n',
    'app.py': 'print("python")\n',
    'package.json': JSON.stringify({ scripts: { start: 'node index.js' } }),
  });
  await assert.rejects(
    () => validateUploadedTarball(ambiguousPackageBundle.buffer),
    /ambiguous command auto-detection/
  );
}

async function testMalformedTarballRejection() {
  for (const probe of [
    {
      name: 'traversal',
      pattern: /invalid bundle path/,
      build(tmp, tarballPath) {
        execFileSync('tar', [
          '-czf',
          tarballPath,
          '-C',
          tmp,
          '--transform=s#app.py#../evil.py#',
          'app.py',
          'floom.yaml',
        ]);
      },
    },
    {
      name: 'hardlink',
      pattern: /unsupported link entry/,
      build(tmp, tarballPath) {
        execFileSync('ln', [join(tmp, 'app.py'), join(tmp, 'hardlink.py')]);
        execFileSync('tar', ['-czf', tarballPath, '-C', tmp, 'app.py', 'hardlink.py', 'floom.yaml']);
      },
    },
    {
      name: 'oversize',
      pattern: /per-file limit/,
      build(tmp, tarballPath) {
        execFileSync('truncate', ['-s', '11M', join(tmp, 'huge.bin')]);
        execFileSync('tar', ['-czf', tarballPath, '-C', tmp, 'app.py', 'huge.bin', 'floom.yaml']);
      },
    },
  ]) {
    const tmp = mkdtempSync(join(tmpdir(), `floom-bad-tar-${probe.name}-`));
    try {
      writeFileSync(join(tmp, 'floom.yaml'), `slug: bad-tar-${probe.name}\ncommand: python app.py\n`);
      writeFileSync(join(tmp, 'app.py'), 'print("bad")\n');
      const tarballPath = join(tmp, 'bad.tar.gz');
      probe.build(tmp, tarballPath);

    let uncaught = false;
    const onUncaught = () => {
      uncaught = true;
    };
    process.once('uncaughtException', onUncaught);
    await assert.rejects(
      () => validateUploadedTarball(readFileSync(tarballPath)),
      probe.pattern
    );
    process.removeListener('uncaughtException', onUncaught);
    assert.equal(uncaught, false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

async function testTemplateBundles() {
  for (const dir of [
    'templates/multi-file-python',
    'templates/node-fetch',
    'templates/run-only-cron',
    'templates/meeting-action-items',
  ]) {
    const bundle = await createBundleFromDirectory(dir);
    const validated = await validateUploadedTarball(bundle.buffer);
    assert.equal(validated.manifest.slug.length > 0, true);
    assert.equal(validated.command.length > 0, true);
    await validated.cleanup();
  }

  const nodeBundle = await createBundleFromDirectory('templates/node-fetch');
  const nodeValidated = await validateUploadedTarball(nodeBundle.buffer);
  assert.equal(nodeValidated.command, 'node index.js');
  assert.equal(nodeValidated.runtimeLabel, 'node');
  assert.ok(nodeValidated.inputSchema);
  assert.ok(nodeValidated.outputSchema);
  await nodeValidated.cleanup();

  const cronBundle = await createBundleFromDirectory('templates/run-only-cron');
  const cronValidated = await validateUploadedTarball(cronBundle.buffer);
  assert.equal(cronValidated.command, 'python app.py');
  assert.equal(cronValidated.inputSchema, null);
  assert.equal(cronValidated.outputSchema, null);
  await cronValidated.cleanup();
}

async function testFakeRunner() {
  process.env.NODE_ENV = 'test';

  const schemaResult = await runInSandboxContained({
    bundle: Buffer.from('print("unused")\n', 'utf8'),
    bundleKind: 'single_file',
    command: 'python app.py',
    legacyEntrypoint: 'app.py',
    inputs: { text: 'hello' },
    hasOutputSchema: true,
  });
  assert.equal(schemaResult.kind, 'success');
  assert.deepEqual(schemaResult.output, {
    result: 'hello from fake mode',
    inputs: { text: 'hello' },
  });

  const stdoutResult = await runInSandboxContained({
    bundle: Buffer.from('print("unused")\n', 'utf8'),
    bundleKind: 'single_file',
    command: 'python app.py',
    legacyEntrypoint: 'app.py',
    inputs: undefined,
    hasOutputSchema: false,
  });
  assert.equal(stdoutResult.kind, 'success');
  assert.deepEqual(stdoutResult.output, {
    stdout: 'hello from fake mode',
    exit_code: 0,
  });
}

async function testQuotaRpcContract() {
  const calls = [];
  let consumed = 0;
  const admin = {
    rpc(name, params) {
      calls.push({ name, params });
      if (name === 'floom_reserve_app_quota_usage') {
        consumed += params.p_seconds;
        return Promise.resolve({
          data: [{
            allowed: true,
            reason: null,
            e2b_seconds_consumed: consumed,
            owner_e2b_seconds_consumed: consumed,
          }],
          error: null,
        });
      }
      if (name === 'floom_adjust_app_quota_usage') {
        consumed = Math.max(0, consumed + params.p_seconds_delta);
        return Promise.resolve({ data: consumed, error: null });
      }
      throw new Error(`unexpected rpc: ${name}`);
    },
    from(table) {
      assert.equal(table, 'app_quota_usage');
      return {
        delete() {
          return {
            lt() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  const reservations = await Promise.all([
    reserveDailyQuota(admin, '00000000-0000-0000-0000-000000000001', 'owner-1', 10),
    reserveDailyQuota(admin, '00000000-0000-0000-0000-000000000001', 'owner-1', 10),
  ]);
  assert.deepEqual(reservations.map((item) => item.allowed), [true, true]);
  assert.equal(consumed, 20);
  assert.equal(calls.filter((call) => call.name === 'floom_reserve_app_quota_usage').length, 2);

  const reconcile = await reconcileQuotaReservation(admin, '00000000-0000-0000-0000-000000000001', 10, 3);
  assert.equal(reconcile.ok, true);
  assert.equal(consumed, 13);

  const recorded = await recordQuotaUsage(admin, '00000000-0000-0000-0000-000000000001', 2.1);
  assert.equal(recorded.ok, true);
  assert.equal(consumed, 16);
}

async function testMcpContract() {
  const toolNames = floomTools.map((tool) => tool.name);
  for (const toolName of [
    'auth_status',
    'get_app_contract',
    'list_app_templates',
    'get_app_template',
    'validate_manifest',
    'publish_app',
    'find_candidate_apps',
    'get_app',
    'run_app',
  ]) {
    assert.ok(toolNames.includes(toolName), `missing MCP tool: ${toolName}`);
  }

  const contract = parseToolResult(await callFloomTool(
    'get_app_contract',
    {},
    { baseUrl: 'http://localhost:3000' }
  ));
  assert.equal(contract.version, 'v0.x-stock-e2b');
  assert.equal(contract.preferred_mode, 'stock_e2b');
  assert.match(contract.files['floom.yaml'], /command:/);
  assert.match(JSON.stringify(contract.supported), /tarball bundle/);
  assert.match(JSON.stringify(contract.manifest_modes), /legacy/);

  const templates = parseToolResult(await callFloomTool(
    'list_app_templates',
    {},
    { baseUrl: 'http://localhost:3000' }
  ));
  const templateKeys = templates.templates.map((template) => template.key);
  assert.ok(templateKeys.includes('multi_file_python'));
  assert.ok(templateKeys.includes('node_fetch'));
  assert.ok(templateKeys.includes('run_only_cron'));

  const validManifest = await callFloomTool(
    'validate_manifest',
    {
      manifest: 'slug: node-fetch\npublic: true\n',
      files: {
        'floom.yaml': 'slug: node-fetch\npublic: true\n',
        'package.json': JSON.stringify({ scripts: { start: 'node index.js' } }),
      },
    },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(validManifest.isError, undefined);
  const manifestResult = parseToolResult(validManifest);
  assert.equal(manifestResult.valid, true);

  const ambiguousManifest = await callFloomTool(
    'validate_manifest',
    {
      manifest: 'slug: ambiguous-command\npublic: true\n',
      files: {
        'floom.yaml': 'slug: ambiguous-command\npublic: true\n',
        'app.py': 'print("python")\n',
        'package.json': JSON.stringify({ scripts: { start: 'node index.js' } }),
      },
    },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(ambiguousManifest.isError, undefined);
  const ambiguousManifestResult = parseToolResult(ambiguousManifest);
  assert.equal(ambiguousManifestResult.valid, false);
  assert.match(ambiguousManifestResult.unsupported_reason, /ambiguous command auto-detection/);

  const runTool = floomTools.find((tool) => tool.name === 'run_app');
  assert.ok(runTool);
  assert.equal(runTool.inputSchema.required.includes('slug'), true);
  assert.equal(runTool.inputSchema.required.includes('inputs'), false);
}

function testDocsAndSpecs() {
  const docsPageText = readFileSync('src/app/docs/page.tsx', 'utf8');
  assert.match(docsPageText, /Thin wrapper on top of E2B/);
  assert.match(docsPageText, /Compressed limit: <code>5 MB<\/code>/);
  assert.match(docsPageText, /stock-E2B Floom contract/i);

  const architectureText = readFileSync('docs/architecture-v0.md', 'utf8');
  assert.match(architectureText, /Preferred post-launch contract/);
  assert.match(architectureText, /Legacy compatibility contract/);
  assert.match(architectureText, /Floom is not a parallel runtime/);

  const specText = readFileSync('docs/v0.x-stock-e2b-spec.md', 'utf8');
  assert.match(specText, /Bundle format/);
  assert.match(specText, /`30` E2B minutes/);
  assert.match(specText, /`main\.go` auto-detection is intentionally not enabled/);

  const changelogText = readFileSync('CHANGELOG.md', 'utf8');
  assert.match(changelogText, /Stock-E2B mode/);
  assert.match(changelogText, /Multi-file Python projects/);
}

function testMigration() {
  const migrationText = readFileSync('supabase/migrations/20260502100000_stock_e2b_mode.sql', 'utf8');
  assert.match(migrationText, /bundle_kind/);
  assert.match(migrationText, /command text/);
  assert.match(migrationText, /app_versions_tarball_command_check/);
  assert.match(migrationText, /app_quota_usage/);
  assert.match(migrationText, /floom_reserve_app_quota_usage/);
  assert.match(migrationText, /floom_adjust_app_quota_usage/);
  assert.match(migrationText, /on conflict \(app_id, window_start\)/i);
  assert.match(migrationText, /error_detail jsonb/);
  assert.match(migrationText, /timed_out/);
}

async function testMcpAppTemplates() {
  const templatesResult = await callFloomTool(
    'list_app_templates',
    {},
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(templatesResult.isError, undefined);
  const templates = parseToolResult(templatesResult).templates;
  assert.deepEqual(
    templates.map((template) => template.key),
    ['invoice_calculator', 'utm_url_builder', 'csv_stats', 'meeting_action_items']
  );

  for (const templateInfo of templates) {
    const templateResult = await callFloomTool(
      'get_app_template',
      { key: templateInfo.key },
      { baseUrl: 'http://localhost:3000' }
    );
    assert.equal(templateResult.isError, undefined);
    const template = parseToolResult(templateResult);
    assert.equal(template.key, templateInfo.key);
    assert.ok(template.files['floom.yaml'], `${templateInfo.key} missing floom.yaml`);
    assert.ok(template.files['app.py'], `${templateInfo.key} missing app.py`);
    assert.equal(template.files['input.schema.json'].type, 'object');
    assert.equal(template.files['output.schema.json'].type, 'object');
    assert.doesNotMatch(template.files['app.py'], /requests|fastapi|openai|anthropic|supabase/i);
    assert.doesNotMatch(template.files['floom.yaml'], /dependencies|secrets|actions/);

    const manifestValidation = await callFloomTool(
      'validate_manifest',
      {
        manifest: template.files['floom.yaml'],
        input_schema: template.files['input.schema.json'],
        output_schema: template.files['output.schema.json'],
      },
      { baseUrl: 'http://localhost:3000' }
    );
    assert.equal(manifestValidation.isError, undefined);
    assert.equal(parseToolResult(manifestValidation).valid, true);

    runTemplatePython(template);
  }

  const unknownTemplate = await callFloomTool(
    'get_app_template',
    { key: 'not-real' },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(unknownTemplate.isError, true);
  assert.match(parseToolResult(unknownTemplate).error, /Unknown app template/);
}

function runTemplatePython(template) {
  const appDir = mkdtempSync(join(tmpdir(), `floom-template-${template.key}-`));
  try {
    writeFileSync(join(appDir, 'app.py'), template.files['app.py']);
    const output = execFileSync(
      'python3',
      [
        '-c',
        [
          'import importlib.util, json, pathlib, sys',
          'path = pathlib.Path(sys.argv[1]) / "app.py"',
          'spec = importlib.util.spec_from_file_location("template_app", path)',
          'module = importlib.util.module_from_spec(spec)',
          'spec.loader.exec_module(module)',
          'print(json.dumps(module.run(json.loads(sys.argv[2])), sort_keys=True))',
        ].join('\n'),
        appDir,
        JSON.stringify(template.example_inputs),
      ],
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);
    assert.equal(typeof parsed, 'object');
    assert.notEqual(parsed, null);
  } finally {
    rmSync(appDir, { recursive: true, force: true });
  }
}

function makeDeepSchema(depth) {
  let schema = { type: 'object' };
  let cursor = schema;
  for (let index = 0; index < depth; index += 1) {
    cursor.properties = { child: { type: 'object' } };
    cursor = cursor.properties.child;
  }
  return schema;
}

function testMcpOriginResolution() {
  const saved = snapshotEnv([
    'FLOOM_ORIGIN',
    'NEXT_PUBLIC_FLOOM_ORIGIN',
    'NEXT_PUBLIC_APP_URL',
    'NODE_ENV',
  ]);

  try {
    process.env.NODE_ENV = 'production';
    process.env.FLOOM_ORIGIN = 'https://floom.example.com/path';
    delete process.env.NEXT_PUBLIC_FLOOM_ORIGIN;
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(
      resolveMcpForwardOrigin('https://attacker.example.com/mcp'),
      'https://floom.example.com'
    );

    delete process.env.FLOOM_ORIGIN;
    assert.equal(resolveMcpForwardOrigin('https://attacker.example.com/mcp'), null);

    process.env.NODE_ENV = 'development';
    assert.equal(
      resolveMcpForwardOrigin('http://localhost:3000/mcp'),
      'http://localhost:3000'
    );
  } finally {
    restoreEnv(saved);
  }
}

function testSecretRedaction() {
  const schema = {
    type: 'object',
    $defs: {
      SecretString: { type: 'string', secret: true },
      RefNested: {
        type: 'object',
        properties: {
          ref_secret_note: { $ref: '#/$defs/SecretString' },
        },
      },
    },
    definitions: {
      LegacySecret: { type: 'string', secret: true },
    },
    properties: {
      answer: { type: 'string' },
      token: { type: 'string', secret: true },
      ref_token: { $ref: '#/$defs/SecretString' },
      legacy_ref_token: { $ref: '#/definitions/LegacySecret' },
      nested: {
        type: 'object',
        properties: {
          visible: { type: 'number' },
          secret_note: { type: 'string', secret: true },
          ref_nested: { $ref: '#/$defs/RefNested' },
        },
      },
      rows: {
        type: 'array',
        items: { $ref: '#/$defs/RefRow' },
      },
      ref_rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            row_ref_secret: { $ref: '#/$defs/SecretString' },
          },
        },
      },
      union_value: {
        anyOf: [
          {
            type: 'object',
            properties: {
              hidden: { type: 'string', secret: true },
            },
          },
        ],
      },
      dynamic: {
        type: 'object',
        additionalProperties: true,
      },
    },
  };
  schema.$defs.RefRow = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      row_secret: { type: 'string', secret: true },
    },
  };

  const value = {
    answer: 'ok',
    token: 'secret-token',
    ref_token: 'ref-private',
    legacy_ref_token: 'legacy-private',
    nested: {
      visible: 7,
      secret_note: 'private',
      ref_nested: { ref_secret_note: 'nested-ref-private' },
    },
    rows: [
      { name: 'a', row_secret: 'row-private' },
      { name: 'b', row_secret: 'row-private-2' },
    ],
    ref_rows: [{ row_ref_secret: 'row-ref-private' }],
    union_value: { hidden: 'union-private' },
    dynamic: {
      visible_extra: 'public-extra',
      api_key: 'dynamic-private',
      nested_extra: { password: 'nested-private', display: 'public-nested' },
      private_key: 'private-key',
      credential: 'credential-value',
      authorization: 'bearer-value',
    },
  };

  const expectedRedacted = {
    answer: 'ok',
    token: REDACTED_OUTPUT_VALUE,
    ref_token: REDACTED_OUTPUT_VALUE,
    legacy_ref_token: REDACTED_OUTPUT_VALUE,
    nested: {
      visible: 7,
      secret_note: REDACTED_OUTPUT_VALUE,
      ref_nested: { ref_secret_note: REDACTED_OUTPUT_VALUE },
    },
    rows: [
      { name: 'a', row_secret: REDACTED_OUTPUT_VALUE },
      { name: 'b', row_secret: REDACTED_OUTPUT_VALUE },
    ],
    ref_rows: [{ row_ref_secret: REDACTED_OUTPUT_VALUE }],
    union_value: { hidden: REDACTED_OUTPUT_VALUE },
    dynamic: {
      visible_extra: 'public-extra',
      api_key: REDACTED_OUTPUT_VALUE,
      nested_extra: { password: REDACTED_OUTPUT_VALUE, display: 'public-nested' },
      private_key: REDACTED_OUTPUT_VALUE,
      credential: REDACTED_OUTPUT_VALUE,
      authorization: REDACTED_OUTPUT_VALUE,
    },
  };

  assert.deepEqual(redactSecretOutput(schema, value), expectedRedacted);
  assert.deepEqual(redactSecretInput(schema, value), expectedRedacted);
  assert.deepEqual(
    redactExactSecretValues(
      {
        result: 'runtime-secret-value',
        embedded: 'prefix runtime-secret-value suffix',
        nested: ['ok', 'runtime-secret-value'],
      },
      ['runtime-secret-value']
    ),
    {
      result: REDACTED_OUTPUT_VALUE,
      embedded: `prefix ${REDACTED_OUTPUT_VALUE} suffix`,
      nested: ['ok', REDACTED_OUTPUT_VALUE],
    }
  );
  assert.equal(value.token, 'secret-token');
  assert.equal(value.rows[0].row_secret, 'row-private');

  const routeText = readFileSync('src/app/api/apps/[slug]/run/route.ts', 'utf8');
  const limitsText = readFileSync('src/lib/floom/limits.ts', 'utf8');
  assert.match(limitsText, /MAX_REQUEST_BYTES = 2 \* 1024 \* 1024/);
  assert.match(limitsText, /MAX_SOURCE_BYTES = 256 \* 1024/);
  assert.match(limitsText, /MAX_INPUT_BYTES = 256 \* 1024/);
  assert.match(limitsText, /MAX_OUTPUT_BYTES = 1024 \* 1024/);
  assert.match(limitsText, /SANDBOX_TIMEOUT_MS = 60_000/);
  assert.match(limitsText, /COMMAND_TIMEOUT_MS = 45_000/);
  assert.match(limitsText, /REQUEST_TIMEOUT_MS = 55_000/);
  assert.match(routeText, /export const maxDuration = 60/);
  assert.match(routeText, /redactSecretInput\(latestVersion\.input_schema \?\? \{\}, inputs\)/);
  assert.match(routeText, /redactExactSecretValues\(/);
  assert.match(routeText, /Object\.values\(runtimeSecrets\.envs\)/);
  assert.match(routeText, /public apps may run anonymously even with runtime secrets/);
  assert.equal(routeText.includes('Secret-backed apps require owner authentication'), false);
  const publishRouteText = readFileSync('src/app/api/apps/route.ts', 'utf8');
  assert.doesNotMatch(publishRouteText, /Secret-backed apps must be private/);
  assert.match(publishRouteText, /getUploadedFile\(form, "input_schema"\)/);
  assert.match(publishRouteText, /getUploadedFile\(form, "output_schema"\)/);
  assert.match(publishRouteText, /Missing input_schema or output_schema upload/);
  assert.doesNotMatch(publishRouteText, /let inputSchema = \{\}/);
  assert.doesNotMatch(publishRouteText, /let outputSchema = \{\}/);
  assert.match(routeText, /input: redactedInputs/);
  assert.ok(
    routeText.indexOf('redactSecretInput') < routeText.indexOf('.from("executions")'),
    'execution inputs must be redacted before insert'
  );
}

function testAsyncRuntimeRoastFixes() {
  const asyncMigration = readFileSync('supabase/migrations/20260502120000_async_runtime.sql', 'utf8');
  assertSqlContains(
    asyncMigration,
    'revoke all on function public.claim_execution_lease(uuid, uuid, timestamptz) from public'
  );
  assertSqlContains(
    asyncMigration,
    'grant execute on function public.claim_execution_lease(uuid, uuid, timestamptz) to service_role'
  );
  assertSqlContains(
    asyncMigration,
    'revoke all on function public.clear_execution_lease(uuid) from public'
  );
  assertSqlContains(
    asyncMigration,
    'grant execute on function public.clear_execution_lease(uuid) to service_role'
  );
  assertSqlContains(asyncMigration, 'perform pg_advisory_xact_lock(hashtext(v_execution.app_id::text))');
  assertSqlContains(asyncMigration, 'v_running_count < v_max_concurrency');
  assertSqlContains(asyncMigration, "status = 'running'");
  assertSqlContains(asyncMigration, "kind in ('status', 'progress', 'heartbeat', 'system')");

  const workerText = readFileSync('src/lib/floom/execution-worker.ts', 'utf8');
  assert.match(workerText, /\.eq\("lease_token", leaseToken\)/);
  assert.match(workerText, /\.gt\("lease_expires_at"/);
  assert.match(workerText, /let started:/);
  assert.match(workerText, /await killSandboxExecution\(started\.sandboxId, started\.pid\)/);
  assert.match(workerText, /buildPollEventInserts/);
  assert.match(workerText, /redactLogChunk\(pollResult\.stdoutChunk, secretValues\)/);
  assert.equal(
    redactLogChunk('stdout sk-live-123 and stderr sk-live-123', ['sk-live-123']),
    `stdout ${REDACTED_OUTPUT_VALUE} and stderr ${REDACTED_OUTPUT_VALUE}`
  );

  const cancelRouteText = readFileSync('src/app/api/executions/[id]/route.ts', 'utf8');
  assert.match(cancelRouteText, /\.maybeSingle<ExecutionRow>\(\)/);
  assert.ok(
    cancelRouteText.indexOf('if (!data)') <
      cancelRouteText.indexOf('await appendExecutionEvent(admin, id, "status"'),
    'queued DELETE race must reload the execution before appending a cancelled event'
  );

  const appPageText = readFileSync('src/app/p/[slug]/AppPermalinkPage.tsx', 'utf8');
  assert.match(appPageText, /\{ id: 'runs', label: 'Runs' \}/);
}

function testApiCompatibilityRoutes() {
  const directRunRouteText = readFileSync('src/app/api/[slug]/run/route.ts', 'utf8');
  const hubRouteText = readFileSync('src/app/api/hub/[slug]/route.ts', 'utf8');

  assert.match(directRunRouteText, /export \{ POST \} from "@\/app\/api\/apps\/\[slug\]\/run\/route"/);
  assert.match(hubRouteText, /export \{ DELETE, GET \} from "@\/app\/api\/apps\/\[slug\]\/route"/);
}

async function testV01DependencyAndSecretMetadata() {
  assert.equal(
    validatePythonRequirementsText(`${REQUESTS_HASHED}\n# ok\n${OPENAI_HASHED}\n`),
    `${REQUESTS_HASHED}\n${OPENAI_HASHED}\n`
  );
  assert.throws(
    () => validatePythonRequirementsText('openai>=1.0\n'),
    /sha256 hashes/
  );
  assert.throws(
    () => validatePythonRequirementsText('requests==2.*\n'),
    /sha256 hashes/
  );
  assert.throws(
    () => validatePythonRequirementsText('requests==2.32.3\n'),
    /sha256 hashes/
  );
  assert.throws(
    () => validatePythonRequirementsText('--extra-index-url https://example.com\nrequests\n'),
    /sha256 hashes/
  );
  assert.throws(
    () => validatePythonRequirementsText('git+https://example.com/repo.git\n'),
    /sha256 hashes/
  );
  assert.deepEqual(
    readRuntimeDependencies({ python_requirements: `${REQUESTS_HASHED}\n` }),
    { python_requirements: `${REQUESTS_HASHED}\n` }
  );
  assert.throws(
    () => readRuntimeDependencies({ python_requirements: 'requests==2.32.3\n' }),
    /sha256 hashes/
  );

  const saved = snapshotEnv(['FLOOM_SECRET_ENCRYPTION_KEY']);
  const secretValue = 'stored-test-secret-value';
  try {
    process.env.FLOOM_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptSecretValue(secretValue);
    assert.doesNotMatch(encrypted, /stored-test-secret-value/);
    assert.equal(decryptSecretValue(encrypted), secretValue);

    const admin = fakeSecretAdmin([
      { name: 'OPENAI_API_KEY', value_ciphertext: encrypted },
    ]);
    const resolved = await resolveRuntimeSecrets(
      admin,
      ['OPENAI_API_KEY'],
      'app-123',
      'user-123'
    );
    assert.equal(resolved.ok, true);
    assert.deepEqual(Object.keys(resolved.envs), ['OPENAI_API_KEY']);
    assert.equal(resolved.envs.OPENAI_API_KEY, secretValue);
    assert.deepEqual(resolved.missing, []);

    const missing = await resolveRuntimeSecrets(
      fakeSecretAdmin([]),
      ['OPENAI_API_KEY'],
      'app-123',
      'user-123'
    );
    assert.equal(missing.ok, true);
    assert.deepEqual(missing.envs, {});
    assert.deepEqual(missing.missing, ['OPENAI_API_KEY']);

    delete process.env.FLOOM_SECRET_ENCRYPTION_KEY;
    const unconfigured = await resolveRuntimeSecrets(
      fakeSecretAdmin([]),
      ['OPENAI_API_KEY'],
      'app-123',
      'user-123'
    );
    assert.deepEqual(unconfigured, { ok: false, error: 'App secrets are not configured' });

    assert.deepEqual(
      await resolveRuntimeSecrets(fakeSecretAdmin([]), [], 'app-123', 'user-123'),
      { ok: true, envs: {}, missing: [] }
    );
  } finally {
    restoreEnv(saved);
  }

  const runRouteText = readFileSync('src/app/api/apps/[slug]/run/route.ts', 'utf8');
  assert.match(runRouteText, /await resolveRuntimeSecrets\(/);
  assert.match(runRouteText, /runtimeSecrets\.envs/);
  assert.doesNotMatch(runRouteText, /FLOOM_APP_SECRET/);

  const secretsRouteText = readFileSync('src/app/api/apps/[slug]/secrets/route.ts', 'utf8');
  assert.match(secretsRouteText, /GET/);
  assert.match(secretsRouteText, /PUT/);
  assert.match(secretsRouteText, /DELETE/);
  assert.match(secretsRouteText, /encryptSecretValue\(value\)/);
  assert.match(secretsRouteText, /\.select\("name, created_at, updated_at"\)/);

  const cliText = readFileSync('cli/secrets.ts', 'utf8');
  assert.match(cliText, /readStdin/);
  assert.doesNotMatch(cliText, /FLOOM_SECRET_VALUE/);
  assert.doesNotMatch(cliText, /console\.log\(.*value/);

  const migrationText = readFileSync(
    'supabase/migrations/20260501090000_app_secrets.sql',
    'utf8'
  );
  assertSqlContains(migrationText, 'create table if not exists public.app_secrets');
  assertSqlContains(migrationText, 'value_ciphertext text not null');
  assertSqlContains(migrationText, 'add constraint app_secrets_app_owner_fkey');
  assertSqlContains(migrationText, 'foreign key (app_id, owner_id)');
  assertSqlContains(migrationText, 'references public.apps(id, owner_id)');
  assertSqlContains(migrationText, 'add constraint app_secrets_app_name_key unique (app_id, name)');
  assertSqlContains(migrationText, "add constraint app_secrets_name_format");
  assertSqlContains(migrationText, "check (name ~ '^[A-Z][A-Z0-9_]{1,63}$')");
  assertSqlContains(migrationText, 'add constraint app_secrets_ciphertext_format');
  assertSqlContains(migrationText, 'alter table public.app_secrets enable row level security');
  assertSqlContains(migrationText, 'create policy "app secrets are not directly readable"');
  assertSqlContains(migrationText, 'using (false)');
  assertSqlContains(migrationText, 'drop policy if exists "owners can create app secrets"');
  assertSqlContains(migrationText, 'drop policy if exists "owners can update app secrets"');
  assertSqlContains(migrationText, 'drop policy if exists "owners can delete app secrets"');
  assert.doesNotMatch(migrationText, /create policy "owners can (create|update|delete) app secrets"/);
  assertSqlContains(migrationText, 'create trigger app_secrets_set_updated_at');
}

async function testMcpGuardrails() {
  const traversal = await callFloomTool(
    'find_candidate_apps',
    { files: { '../floom.yaml': 'name: Bad\n' } },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(traversal.isError, true);
  assert.match(parseToolResult(traversal).error, /Invalid file path/);

  const largeFile = await callFloomTool(
    'find_candidate_apps',
    { files: { 'huge/floom.yaml': 'x'.repeat(70 * 1024) } },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(largeFile.isError, true);
  assert.match(parseToolResult(largeFile).error, /File is too large/);

  const largeManifest = await callFloomTool(
    'validate_manifest',
    { manifest: 'x'.repeat(80 * 1024) },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(largeManifest.isError, true);
  assert.match(parseToolResult(largeManifest).error, /manifest is too large|Tool arguments are too large/);

  const largeRun = await callFloomTool(
    'run_app',
    { slug: 'pitch-coach', inputs: { text: 'x'.repeat(280 * 1024) } },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(largeRun.isError, true);
  assert.match(parseToolResult(largeRun).error, /inputs are too large/);
}

async function testSandboxDependenciesAndSecrets() {
  const saved = snapshotEnv([
    'E2B_API_KEY',
    'FLOOM_EXECUTION_MODE',
    'FLOOM_FAKE_E2B',
    'NODE_ENV',
  ]);
  const originalCreate = Sandbox.create;
  const commands = [];
  const createOpts = [];
  const writes = [];

  process.env.E2B_API_KEY = 'test-e2b-key';
  delete process.env.FLOOM_EXECUTION_MODE;
  delete process.env.FLOOM_FAKE_E2B;
  process.env.NODE_ENV = 'production';

  Sandbox.create = async (_template, opts) => {
    const sandboxIndex = createOpts.length;
    createOpts.push(opts);
    return {
      files: {
        write: async (path, value) => writes.push({ sandboxIndex, path, value }),
        read: async (path, opts) => (
          opts?.format === 'bytes' || path.endsWith('deps.tgz')
            ? new Uint8Array([1, 2, 3])
            : '{"ok": true}'
        ),
      },
      commands: {
        run: async (command, runOpts) => {
          commands.push({ sandboxIndex, command, runOpts });
        },
      },
      kill: async () => undefined,
      createOpts: opts,
    };
  };

  try {
    const result = await runInSandbox(
      'def run(inputs): return {"ok": True}',
      {},
      'python',
      'app.py',
      'run',
      { python_requirements: `${REQUESTS_HASHED}\n` },
      { OPENAI_API_KEY: 'runtime-secret' }
    );
    assert.deepEqual(result, { output: { ok: true } });
    assert.equal(createOpts.length, 2);
    assert.equal(createOpts[0].allowInternetAccess, true);
    assert.equal(createOpts[1].allowInternetAccess, true);
    assert.equal(
      writes.find((item) => item.sandboxIndex === 0 && item.path === '/home/user/requirements.txt')?.value,
      `${REQUESTS_HASHED}\n`
    );
    assert.match(commands[0].command, /pip install/);
    assert.match(commands[0].command, /--require-hashes/);
    assert.equal(commands[0].sandboxIndex, 0);
    assert.equal(commands[0].runOpts.envs, undefined);
    assert.match(commands[1].command, /deps\.tgz/);
    assert.equal(commands[1].sandboxIndex, 0);
    assert.match(commands[2].command, /deps\.tgz/);
    assert.equal(commands[2].sandboxIndex, 1);
    assert.match(commands[3].command, /runner\.py/);
    assert.equal(commands[3].sandboxIndex, 1);
    assert.deepEqual(commands[3].runOpts.envs, { OPENAI_API_KEY: 'runtime-secret' });
    assert.match(
      writes.find((item) => item.sandboxIndex === 1 && item.path === '/home/user/runner.py')?.value,
      /\/home\/user\/\.deps/
    );
  } finally {
    Sandbox.create = originalCreate;
    restoreEnv(saved);
  }
}

function testPublicRunRateLimitHardening() {
  const routeText = readFileSync('src/app/api/apps/[slug]/run/route.ts', 'utf8');
  const migrationText = readFileSync(
    'supabase/migrations/20260430080000_floom_v0_core.sql',
    'utf8'
  );

  assert.equal(getPublicRunRateLimitKey('app_123'), 'public-run:app_123:anonymous');
  assert.equal(getPublicRunAppRateLimitKey('app/123'), 'public-run-app:app-123');
  const callerA = getPublicRunCallerKey(new Headers({
    'x-forwarded-for': '203.0.113.8, 10.0.0.1',
    'user-agent': 'ua-a',
  }));
  const callerB = getPublicRunCallerKey(new Headers({
    'x-forwarded-for': '203.0.113.9',
    'user-agent': 'ua-a',
  }));
  assert.match(callerA, /^[a-f0-9]{32}$/);
  assert.notEqual(callerA, callerB);
  assert.equal(getPublicRunCallerKey(new Headers()), 'anonymous');
  assert.equal(getPublicRunRateLimitKey('app/123', callerA), `public-run:app-123:${callerA}`);
  assert.match(getRunCallerKey(
    { kind: 'user', userId: 'user-123', agentTokenId: null },
    new Headers()
  ), /^[a-f0-9]{32}$/);
  assert.notEqual(
    getRunCallerKey({ kind: 'user', userId: 'user-123', agentTokenId: null }, new Headers()),
    getRunCallerKey({
      kind: 'agent_token',
      userId: 'user-123',
      agentTokenId: 'token-123',
      scopes: ['run'],
    }, new Headers())
  );
  assert.match(routeText, /check_public_run_rate_limit/);
  assert.ok(
    routeText.indexOf('checkPublicRunRateLimit') < routeText.indexOf('runInSandboxContained('),
    'public run rate limit must run before sandbox execution'
  );
  assert.match(routeText, /getBearerToken\(req\)/);
  assert.match(routeText, /bearerToken && !caller/);
  assert.match(routeText, /getRunCallerKey\(caller, req\.headers\)/);
  assert.doesNotMatch(routeText, /if \(!caller && isPublic\)/);
  assert.match(routeText, /getPublicRunRateLimitKey\(appId, callerKey\)/);
  assert.match(routeText, /getPublicRunAppRateLimitKey\(appId\)/);
  assert.match(routeText, /FLOOM_PUBLIC_RUN_APP_RATE_LIMIT_MAX/);
  assert.ok(
    routeText.indexOf('getPublicRunRateLimitKey(appId, callerKey)') <
      routeText.indexOf('getPublicRunAppRateLimitKey(appId)'),
    'caller-derived rate limit must be checked before the app-level rate limit'
  );
  assert.ok(
    routeText.indexOf('const rateLimit = await checkPublicRunRateLimit') <
      routeText.indexOf('runInSandboxContained('),
    'all run rate limits must run before sandbox execution'
  );
  assert.match(routeText, /Run rate limit check failed/);
  assert.match(routeText, /redactSecretOutput/);
  assert.match(routeText, /output: redactedOutput/);
  assert.match(routeText, /runInSandboxContained/);
  assert.match(routeText, /status: result\.error \? "error"/);
  assert.match(routeText, /error: result\.error \|\|/);

  assert.match(migrationText, /create table if not exists public\.public_run_rate_limits/);
  assert.match(migrationText, /create or replace function public\.check_public_run_rate_limit/);
  assert.match(migrationText, /security definer/);
  assert.match(migrationText, /revoke all on function public\.check_public_run_rate_limit/);
  assert.match(migrationText, /grant execute on function public\.check_public_run_rate_limit/);
  assert.match(migrationText, /alter table public\.public_run_rate_limits enable row level security/);
  assertSqlContains(migrationText, 'alter table public.apps add constraint apps_pkey primary key (id)');
  assertSqlContains(migrationText, 'alter table public.apps add constraint apps_slug_key unique (slug)');
  assertSqlContains(migrationText, 'add constraint apps_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade');
  assertSqlContains(migrationText, "add constraint apps_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')");
  assertSqlContains(migrationText, "add constraint apps_runtime_supported check (runtime in ('python'))");
  assertSqlContains(migrationText, 'alter table public.app_versions add constraint app_versions_pkey primary key (id)');
  assertSqlContains(migrationText, 'add constraint app_versions_app_id_fkey foreign key (app_id) references public.apps(id) on delete cascade');
  assertSqlContains(migrationText, 'add constraint app_versions_bundle_path_key unique (bundle_path)');
  assertSqlContains(migrationText, 'add constraint app_versions_app_version_unique unique (app_id, version)');
  assertSqlContains(migrationText, 'add constraint app_versions_version_positive check (version > 0)');
  assertSqlContains(migrationText, 'alter table public.agent_tokens add constraint agent_tokens_pkey primary key (id)');
  assertSqlContains(migrationText, 'add constraint agent_tokens_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete cascade');
  assertSqlContains(migrationText, 'add constraint agent_tokens_token_hash_key unique (token_hash)');
  assertSqlContains(migrationText, "add constraint agent_tokens_hash_sha256 check (token_hash ~ '^[a-f0-9]{64}$')");
  assertSqlContains(migrationText, 'alter table public.executions add constraint executions_pkey primary key (id)');
  assertSqlContains(migrationText, 'add constraint executions_app_id_fkey foreign key (app_id) references public.apps(id) on delete cascade');
  assertSqlContains(migrationText, 'add constraint executions_version_id_fkey foreign key (version_id) references public.app_versions(id) on delete set null');
  assertSqlContains(migrationText, 'add constraint executions_caller_user_id_fkey foreign key (caller_user_id) references auth.users(id) on delete set null');
  assertSqlContains(migrationText, 'add constraint executions_caller_agent_token_id_fkey foreign key (caller_agent_token_id) references public.agent_tokens(id) on delete set null');
  assertSqlContains(migrationText, "add constraint executions_status_valid check (status in ('running', 'success', 'error'))");
  assertSqlContains(migrationText, 'add constraint public_run_rate_limits_pkey primary key (rate_key)');
  assertSqlContains(migrationText, 'add constraint public_run_rate_limits_rate_key_key unique (rate_key)');
  assertSqlContains(migrationText, "pg_get_constraintdef(oid) in ('PRIMARY KEY (rate_key)', 'UNIQUE (rate_key)')");
  assertSqlContains(migrationText, 'on conflict (rate_key) do update');
  assertSqlContains(migrationText, 'create or replace function public.floom_set_updated_at()');
  assertSqlContains(migrationText, 'create or replace function public.floom_handle_new_user()');
  assertSqlContains(migrationText, 'create trigger floom_on_auth_user_created');
  assertSqlContains(migrationText, 'drop trigger if exists on_auth_user_created on auth.users');
  const triggerRetirementText = readFileSync(
    'supabase/migrations/20260430100000_retire_legacy_auth_trigger.sql',
    'utf8'
  );
  assertSqlContains(triggerRetirementText, 'drop trigger if exists on_auth_user_created on auth.users');
  assertSqlContains(migrationText, 'values (\'app-bundles\', \'app-bundles\', false, 1048576) on conflict (id) do nothing');
  const storageHardeningText = readFileSync(
    'supabase/migrations/20260430103000_harden_app_bundle_storage.sql',
    'utf8'
  );
  assertSqlContains(storageHardeningText, "update storage.buckets set public = false where id = 'app-bundles'");
  assertSqlContains(storageHardeningText, 'alter table storage.objects enable row level security');
  assertSqlContains(storageHardeningText, "alter table public.agent_tokens alter column scopes set default array['read', 'run', 'publish']::text[]");
  assert.doesNotMatch(storageHardeningText, /publish', 'revoke/);
  assertSqlContains(storageHardeningText, 'create policy "app bundles readable by owning user"');
  assertSqlContains(storageHardeningText, 'create policy "app bundles writable by owning user"');
  assertSqlContains(storageHardeningText, 'create policy "app bundles updateable by owning user"');
  assertSqlContains(storageHardeningText, 'create policy "app bundles deletable by owning user"');
  assert.doesNotMatch(migrationText, /create or replace function public\.set_updated_at\(\)/);
  assert.doesNotMatch(migrationText, /create or replace function public\.handle_new_user\(\)/);
  assert.doesNotMatch(migrationText, /on conflict \(id\) do update\s+set public = excluded\.public/);

  const tokenRouteText = readFileSync('src/app/api/agent-tokens/route.ts', 'utf8');
  assert.match(tokenRouteText, /MAX_AGENT_TOKEN_NAME_LENGTH = 80/);
  assert.match(tokenRouteText, /DEFAULT_MAX_ACTIVE_AGENT_TOKENS_PER_USER = 10/);
  assert.match(tokenRouteText, /\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(tokenRouteText, /status: 400/);
  assert.match(tokenRouteText, /status: 429/);

  const tokenLibText = readFileSync('src/lib/supabase/agent-tokens.ts', 'utf8');
  assert.match(tokenLibText, /scopes: string\[\] = \["read", "run", "publish"\]/);
  assert.doesNotMatch(tokenLibText, /"revoke"\]/);
}

function testAppDeleteRoute() {
  const routeText = readFileSync('src/app/api/apps/[slug]/route.ts', 'utf8');

  assert.match(routeText, /export async function DELETE/);
  assert.match(routeText, /resolveAuthCaller\(req, admin\)/);
  assert.match(routeText, /callerHasScope\(caller, "publish"\)/);
  assert.match(routeText, /Missing publish scope/);
  assert.match(routeText, /\.select\("id, owner_id, app_versions\(bundle_path\)"\)/);
  assert.match(routeText, /owner_id !== caller\.userId/);
  assert.match(routeText, /App not found/);
  assert.match(routeText, /storage\s*\.\s*from\("app-bundles"\)\s*\.\s*remove\(bundlePaths\)/s);
  assert.match(routeText, /\.from\("apps"\)\s*\.\s*delete\(\)/s);
  assert.match(routeText, /\.eq\("owner_id", caller\.userId\)/);
  assert.match(routeText, /data: deletedRows/);
  assert.match(routeText, /deletedRows\.length !== 1/);
  assert.match(routeText, /Failed to clean up app bundles after app deletion/);
  assert.doesNotMatch(routeText, /Failed to delete app bundles/);
  assert.ok(
    routeText.indexOf('.from("apps")\n    .delete()') < routeText.indexOf('.remove(bundlePaths)'),
    'app row deletion must happen before best-effort bundle cleanup'
  );
  assert.match(routeText, /return NextResponse\.json\(\{ deleted: true, slug \}\)/);
}

function testOAuthCallbackErrorHandling() {
  const routeText = readFileSync('src/app/auth/callback/route.ts', 'utf8');

  assert.match(routeText, /AUTH_CALLBACK_ERROR = "oauth_callback"/);
  assert.match(routeText, /AUTH_CALLBACK_ERROR_MESSAGE = "Authentication failed\. Please try again\."/);
  assert.match(routeText, /tokenHash = searchParams\.get\("token_hash"\)/);
  assert.match(routeText, /type = searchParams\.get\("type"\)/);
  assert.match(routeText, /const \{ error \} = code/);
  assert.match(routeText, /await supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(routeText, /await supabase\.auth\.verifyOtp\(\{ token_hash: tokenHash, type \}\)/);
  assert.match(routeText, /function isEmailOtpType\(type: string \| null\): type is EmailOtpType/);
  assert.match(routeText, /if \(error\)/);
  assert.ok(
    routeText.indexOf('if (error)') < routeText.indexOf('return NextResponse.redirect(new URL(safeNext, resolvePublicOrigin(req)))'),
    'OAuth callback must only use next redirect after successful code exchange'
  );
  assert.ok(
    routeText.indexOf('await supabase.auth.exchangeCodeForSession(code)') < routeText.indexOf('await supabase.auth.verifyOtp({ token_hash: tokenHash, type })'),
    'OAuth callback must prefer OAuth code exchange over email token-hash verification'
  );
  assert.ok(
    routeText.indexOf('redirectUrl.searchParams.set("error", AUTH_CALLBACK_ERROR)') <
      routeText.indexOf('redirectUrl.searchParams.set("message", AUTH_CALLBACK_ERROR_MESSAGE)'),
    'OAuth callback failure redirect must include sanitized error and message query params'
  );
  assert.doesNotMatch(routeText, /searchParams\.set\("message",\s*error\.message/);
  assert.doesNotMatch(routeText, /new URL\(safeNext,[\s\S]*if \(error\)/);
  assert.doesNotMatch(routeText, /verifyOtp\(\{ token:/);
  assert.match(routeText, /process\.env\.FLOOM_ORIGIN/);
  assert.match(routeText, /x-forwarded-host/);
  assert.match(routeText, /x-forwarded-proto/);
}

function testCliRejectsUnsupportedV0Shapes(manifestText, inputSchemaText, outputSchemaText) {
  const appDir = mkdtempSync(join(tmpdir(), 'floom-v0-reject-'));
  try {
    writeFileSync(join(appDir, 'floom.yaml'), manifestText);
    writeFileSync(join(appDir, 'input.schema.json'), inputSchemaText);
    writeFileSync(join(appDir, 'output.schema.json'), outputSchemaText);
    writeFileSync(join(appDir, 'app.py'), 'def run(inputs):\n    return {"result": "ok", "length": 2}\n');
    writeFileSync(join(appDir, 'helper.py'), 'VALUE = 1\n');
    expectCliFailure(appDir, /exactly one Python source file/);
    rmSync(join(appDir, 'helper.py'));
    writeFileSync(join(appDir, 'requirements.txt'), 'requests\n');
    expectCliFailure(appDir, /requirements\.txt requires dependencies\.python/);
    writeFileSync(
      join(appDir, 'floom.yaml'),
      `${manifestText}\ndependencies:\n  python: ./requirements.txt\n`
    );
    writeFileSync(join(appDir, 'requirements.txt'), 'https://example.com/pkg.whl\n');
    expectCliFailure(appDir, /sha256 hashes/);
  } finally {
    rmSync(appDir, { recursive: true, force: true });
  }
}

function expectCliFailure(appDir, pattern) {
  try {
    execFileSync('npx', ['tsx', 'cli/deploy.ts', appDir], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FLOOM_TOKEN: 'test-token',
        FLOOM_API_URL: 'http://127.0.0.1:9',
      },
      stdio: 'pipe',
      encoding: 'utf8',
    });
    throw new Error('CLI unexpectedly succeeded');
  } catch (error) {
    const output = [
      error instanceof Error ? error.message : '',
      typeof error.stdout === 'string' ? error.stdout : '',
      typeof error.stderr === 'string' ? error.stderr : '',
    ].join('\n');
    assert.match(output, pattern);
  }
}

function testV01LaunchFixtures() {
  const requirementsManifest = readFileSync('fixtures/python-requirements/floom.yaml', 'utf8');
  const requirementsText = readFileSync('fixtures/python-requirements/requirements.txt', 'utf8');
  const requirementsSource = readFileSync('fixtures/python-requirements/app.py', 'utf8');
  const parsedRequirementsManifest = parseManifest(yaml.load(requirementsManifest));
  assert.deepEqual(parsedRequirementsManifest.dependencies, { python: 'requirements.txt' });
  assert.match(validatePythonRequirementsText(requirementsText), /humanize==4\.9\.0 --hash=sha256:/);
  validatePythonSourceForManifest(requirementsSource, parsedRequirementsManifest);

  const secretManifest = readFileSync('fixtures/python-secret/floom.yaml', 'utf8');
  const secretSource = readFileSync('fixtures/python-secret/app.py', 'utf8');
  const parsedSecretManifest = parseManifest(yaml.load(secretManifest));
  assert.deepEqual(parsedSecretManifest.secrets, ['FLOOM_TEST_SECRET']);
  validatePythonSourceForManifest(secretSource, parsedSecretManifest);
}

async function testSandboxErrorContainment() {
  const saved = snapshotEnv([
    'E2B_API_KEY',
    'FLOOM_EXECUTION_MODE',
    'FLOOM_FAKE_E2B',
    'NODE_ENV',
  ]);
  const originalCreate = Sandbox.create;

  process.env.E2B_API_KEY = 'test-e2b-key';
  delete process.env.FLOOM_EXECUTION_MODE;
  delete process.env.FLOOM_FAKE_E2B;
  process.env.NODE_ENV = 'production';
  Sandbox.create = async () => {
    throw new Error('auth/network failed with test-e2b-key');
  };

  try {
    const createFailure = await runInSandbox(
      'def run(inputs): return {"result": "hello"}',
      { name: 'Floom' },
      'python',
      'app.py',
      'run'
    );
    assert.deepEqual(createFailure, { output: {}, error: 'App execution failed' });

    const containedFailure = await runInSandboxContained(
      'def run(inputs): return {"result": "hello"}',
      { name: 'Floom' },
      'python',
      'app.py',
      'run',
      {},
      {},
      async () => {
        throw new Error('runner rejected with secret payload');
      }
    );
    assert.deepEqual(containedFailure, { output: {}, error: 'App execution failed' });
  } finally {
    Sandbox.create = originalCreate;
    restoreEnv(saved);
  }
}

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function fakeSecretAdmin(rows, error = null) {
  const calls = [];
  const builder = {
    select(value) {
      calls.push(['select', value]);
      return builder;
    },
    eq(field, value) {
      calls.push(['eq', field, value]);
      return builder;
    },
    in(field, value) {
      calls.push(['in', field, value]);
      assert.deepEqual(calls, [
        ['select', 'name, value_ciphertext'],
        ['eq', 'app_id', 'app-123'],
        ['eq', 'owner_id', 'user-123'],
        ['in', 'name', ['OPENAI_API_KEY']],
      ]);
      return Promise.resolve({ data: rows, error });
    },
  };

  return {
    from(table) {
      assert.equal(table, 'app_secrets');
      return builder;
    },
  };
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
