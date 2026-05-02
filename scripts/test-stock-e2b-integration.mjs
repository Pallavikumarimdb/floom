import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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
