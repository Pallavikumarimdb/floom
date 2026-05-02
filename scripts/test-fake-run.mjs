import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBundleFromDirectory, createBundleFromFileMap, validateUploadedTarball } from '../src/lib/floom/bundle.ts';
import { runInSandboxContained } from '../src/lib/e2b/runner.ts';
import {
  isLegacyPythonManifest,
  parseManifest,
  resolveManifestDisplayName,
  resolvePythonDependencyConfig,
  validatePythonSourceForManifest,
} from '../src/lib/floom/manifest.ts';
import { validatePythonRequirementsText } from '../src/lib/floom/requirements.ts';
import { floomTools, callFloomTool } from '../src/lib/mcp/tools.ts';

function parseToolResult(result) {
  return JSON.parse(result.content[0].text);
}

async function test() {
  testManifestModes();
  testRequirementsValidation();
  await testBundleValidation();
  await testTemplateBundles();
  await testFakeRunner();
  await testMcpContract();
  testDocsAndSpecs();
  testMigration();
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
        'index.js': 'console.log(JSON.stringify({ ok: true }))\n',
      },
    },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(validManifest.isError, undefined);
  const manifestResult = parseToolResult(validManifest);
  assert.equal(manifestResult.valid, true);

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
  assert.match(migrationText, /app_quota_usage/);
  assert.match(migrationText, /error_detail jsonb/);
  assert.match(migrationText, /timed_out/);
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
