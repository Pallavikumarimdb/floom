import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import FormData from 'form-data';
import fetch from 'node-fetch';

const apiUrl = process.env.FLOOM_API_URL;
const token = process.env.FLOOM_TOKEN;

if (!apiUrl || !token) {
  console.log('Skipping stock-E2B integration test: set FLOOM_API_URL and FLOOM_TOKEN.');
  process.exit(0);
}

await main().catch((error) => {
  console.error('Integration test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const templates = [
    {
      dir: 'templates/multi-file-python',
      slugPrefix: 'multi-file-python',
      inputs: { text: 'Stock E2B integration test for multi-file python.' },
      assertOutput(output) {
        assert.equal(typeof output.preview, 'string');
        assert.equal(typeof output.word_count, 'number');
      },
    },
    {
      dir: 'templates/node-fetch',
      slugPrefix: 'node-fetch',
      inputs: { url: 'https://example.com' },
      assertOutput(output) {
        assert.equal(output.url, 'https://example.com');
        assert.equal(typeof output.title, 'string');
        assert.equal(typeof output.status, 'number');
      },
    },
    {
      dir: 'templates/run-only-cron',
      slugPrefix: 'run-only-cron',
      inputs: undefined,
      assertOutput(output) {
        assert.equal(typeof output.stdout, 'string');
        assert.match(output.stdout, /cron tick/);
      },
    },
    {
      dir: 'templates/meeting-action-items',
      slugPrefix: 'meeting-action-items',
      inputs: {
        transcript: [
          'Action: Sarah sends launch notes by Friday',
          'Marcus owns beta checklist tomorrow',
          'Anna will run demo QA before launch',
        ].join('\n'),
        default_owner: '',
      },
      assertOutput(output) {
        assert.equal(output.count, 3);
        assert.deepEqual(output.items.map((item) => item.owner), ['Sarah', 'Marcus', 'Anna']);
      },
    },
  ];

  for (const testCase of templates) {
    const tempDir = cloneTemplateWithUniqueSlug(testCase.dir, testCase.slugPrefix);
    try {
      execFileSync('node_modules/.bin/tsx', ['cli/deploy.ts', tempDir, apiUrl, token], {
        cwd: process.cwd(),
        stdio: 'pipe',
        env: process.env,
      });

      const slug = readSlug(join(tempDir, 'floom.yaml'));
      const result = await runRest(slug, testCase.inputs);
      assert.equal(result.status, 'success');
      testCase.assertOutput(result.output);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const e2eDir = createAdHocProject();
  try {
    execFileSync('node_modules/.bin/tsx', ['cli/deploy.ts', e2eDir, apiUrl, token], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env,
    });

    const slug = readSlug(join(e2eDir, 'floom.yaml'));
    const rest = await runRest(slug, { text: 'Generated project from integration harness.' });
    assert.equal(rest.status, 'success');
    assert.equal(rest.output.word_count, 5);

    const mcp = await runMcp(slug, { text: 'Generated project from integration harness.' });
    assert.equal(mcp.status, 'success');
    assert.equal(mcp.output.word_count, 5);
  } finally {
    rmSync(e2eDir, { recursive: true, force: true });
  }

  const explicitCommandDir = createExplicitCommandProject();
  try {
    execFileSync('node_modules/.bin/tsx', ['cli/deploy.ts', explicitCommandDir, apiUrl, token], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env,
    });

    const slug = readSlug(join(explicitCommandDir, 'floom.yaml'));
    const rest = await runRest(slug, { text: 'explicit command survives publish' });
    assert.equal(rest.status, 'success');
    assert.equal(rest.output.text, 'explicit command survives publish');
    assert.equal(rest.output.worker, true);
  } finally {
    rmSync(explicitCommandDir, { recursive: true, force: true });
  }

  const legacyEntrypointDir = createLegacyEntrypointProject();
  try {
    execFileSync('node_modules/.bin/tsx', ['cli/deploy.ts', legacyEntrypointDir, apiUrl, token], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env,
    });

    const slug = readSlug(join(legacyEntrypointDir, 'floom.yaml'));
    const rest = await runRest(slug, { text: 'legacy handler.py path' });
    assert.equal(rest.status, 'success');
    assert.equal(rest.output.text, 'legacy handler.py path');
    assert.equal(rest.output.legacy, true);
  } finally {
    rmSync(legacyEntrypointDir, { recursive: true, force: true });
  }

  await assertMalformedTraversalTarballRejected();

  console.log('Stock-E2B integration suite passed.');
}

function cloneTemplateWithUniqueSlug(sourceDir, slugPrefix) {
  const tempDir = mkdtempSync(join(tmpdir(), `${slugPrefix}-`));
  cpSync(sourceDir, tempDir, { recursive: true });
  const slug = `${slugPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  rewriteSlug(join(tempDir, 'floom.yaml'), slug);
  return tempDir;
}

function createAdHocProject() {
  const tempDir = mkdtempSync(join(tmpdir(), 'stock-e2b-e2e-'));
  const slug = `adhoc-stock-e2b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  writeFileSync(join(tempDir, 'floom.yaml'), [
    'name: Adhoc Stock E2B Project',
    `slug: ${slug}`,
    'public: true',
    'input_schema: ./input.schema.json',
    'output_schema: ./output.schema.json',
  ].join('\n'));
  writeFileSync(join(tempDir, 'app.py'), [
    'import json',
    'import os',
    'import sys',
    '',
    'from utils import summarize',
    '',
    'raw = os.environ.get("FLOOM_INPUTS") or sys.stdin.read() or "{}"',
    'print(json.dumps(summarize(json.loads(raw))))',
  ].join('\n'));
  writeFileSync(join(tempDir, 'utils.py'), [
    'def summarize(inputs):',
    '    text = str(inputs.get("text") or "").strip()',
    '    return {"word_count": len([part for part in text.split() if part])}',
  ].join('\n'));
  writeFileSync(join(tempDir, 'input.schema.json'), JSON.stringify({
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: { text: { type: 'string' } },
  }, null, 2));
  writeFileSync(join(tempDir, 'output.schema.json'), JSON.stringify({
    type: 'object',
    required: ['word_count'],
    additionalProperties: false,
    properties: { word_count: { type: 'integer' } },
  }, null, 2));
  return tempDir;
}

function createExplicitCommandProject() {
  const tempDir = mkdtempSync(join(tmpdir(), 'stock-e2b-explicit-command-'));
  const slug = `explicit-command-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  writeFileSync(join(tempDir, 'floom.yaml'), [
    'name: Explicit Command Project',
    `slug: ${slug}`,
    'public: true',
    'command: python worker.py',
    'input_schema: ./input.schema.json',
    'output_schema: ./output.schema.json',
  ].join('\n'));
  writeFileSync(join(tempDir, 'worker.py'), [
    'import json',
    'import os',
    'import sys',
    '',
    'raw = os.environ.get("FLOOM_INPUTS") or sys.stdin.read() or "{}"',
    'inputs = json.loads(raw)',
    'print(json.dumps({"text": inputs.get("text"), "worker": True}))',
  ].join('\n'));
  writeFileSync(join(tempDir, 'input.schema.json'), JSON.stringify({
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: { text: { type: 'string' } },
  }, null, 2));
  writeFileSync(join(tempDir, 'output.schema.json'), JSON.stringify({
    type: 'object',
    required: ['text', 'worker'],
    additionalProperties: false,
    properties: {
      text: { type: 'string' },
      worker: { type: 'boolean' },
    },
  }, null, 2));
  return tempDir;
}

function createLegacyEntrypointProject() {
  const tempDir = mkdtempSync(join(tmpdir(), 'stock-e2b-legacy-entrypoint-'));
  const slug = `legacy-entrypoint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  writeFileSync(join(tempDir, 'floom.yaml'), [
    'name: Legacy Entrypoint Project',
    `slug: ${slug}`,
    'runtime: python',
    'entrypoint: handler.py',
    'handler: run',
    'public: true',
    'input_schema: ./input.schema.json',
    'output_schema: ./output.schema.json',
  ].join('\n'));
  writeFileSync(join(tempDir, 'handler.py'), [
    'def run(inputs):',
    '    return {"text": inputs.get("text"), "legacy": True}',
  ].join('\n'));
  writeFileSync(join(tempDir, 'input.schema.json'), JSON.stringify({
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: { text: { type: 'string' } },
  }, null, 2));
  writeFileSync(join(tempDir, 'output.schema.json'), JSON.stringify({
    type: 'object',
    required: ['text', 'legacy'],
    additionalProperties: false,
    properties: {
      text: { type: 'string' },
      legacy: { type: 'boolean' },
    },
  }, null, 2));
  return tempDir;
}

async function assertMalformedTraversalTarballRejected() {
  for (const probe of [
    {
      name: 'traversal',
      pattern: /invalid_manifest|invalid bundle path/,
      build(tempDir, tarballPath) {
        execFileSync('tar', [
          '-czf',
          tarballPath,
          '-C',
          tempDir,
          '--transform=s#app.py#../evil.py#',
          'app.py',
          'floom.yaml',
        ]);
      },
    },
    {
      name: 'hardlink',
      pattern: /unsupported link entry/,
      build(tempDir, tarballPath) {
        execFileSync('ln', [join(tempDir, 'app.py'), join(tempDir, 'hardlink.py')]);
        execFileSync('tar', ['-czf', tarballPath, '-C', tempDir, 'app.py', 'hardlink.py', 'floom.yaml']);
      },
    },
    {
      name: 'oversize',
      pattern: /per-file limit/,
      build(tempDir, tarballPath) {
        execFileSync('truncate', ['-s', '11M', join(tempDir, 'huge.bin')]);
        execFileSync('tar', ['-czf', tarballPath, '-C', tempDir, 'app.py', 'huge.bin', 'floom.yaml']);
      },
    },
  ]) {
    const tempDir = mkdtempSync(join(tmpdir(), `stock-e2b-bad-tar-${probe.name}-`));
    try {
      const manifestText = [
        `slug: bad-tar-${probe.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        'command: python app.py',
      ].join('\n');
      writeFileSync(join(tempDir, 'floom.yaml'), manifestText);
      writeFileSync(join(tempDir, 'app.py'), 'print("bad")\n');
      const tarballPath = join(tempDir, 'bad.tar.gz');
      probe.build(tempDir, tarballPath);

      const form = new FormData();
      form.append('manifest', Buffer.from(manifestText, 'utf8'), {
        filename: 'floom.yaml',
        contentType: 'application/x-yaml',
      });
      form.append('bundle', readFileSync(tarballPath), {
        filename: 'bundle.tar.gz',
        contentType: 'application/gzip',
      });

      const response = await fetch(`${apiUrl}/api/apps`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
        body: form,
      });
      const data = await response.json();
      assert.equal(response.status, 400);
      assert.match(`${data.error} ${data.detail}`, probe.pattern);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

function rewriteSlug(manifestPath, slug) {
  const next = readFileSync(manifestPath, 'utf8').replace(/^slug:\s+.+$/m, `slug: ${slug}`);
  writeFileSync(manifestPath, next);
}

function readSlug(manifestPath) {
  const match = readFileSync(manifestPath, 'utf8').match(/^slug:\s+(.+)$/m);
  if (!match) {
    throw new Error(`Missing slug in ${manifestPath}`);
  }
  return match[1].trim();
}

async function runRest(slug, inputs) {
  const response = await fetch(`${apiUrl}/api/apps/${slug}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(inputs === undefined ? {} : { inputs }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`REST run failed for ${slug}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function runMcp(slug, inputs) {
  const response = await fetch(`${apiUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'run_app',
        arguments: inputs === undefined ? { slug } : { slug, inputs },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(`MCP run failed for ${slug}: ${JSON.stringify(data)}`);
  }
  const toolResult = JSON.parse(data.result.content[0].text);
  return toolResult;
}
