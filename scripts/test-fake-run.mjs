// Test script that exercises the fake-mode runner locally
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Sandbox } from 'e2b';
import { runInSandbox, runInSandboxContained } from '../src/lib/e2b/runner.ts';
import { getPublicRunRateLimitKey } from '../src/lib/floom/rate-limit.ts';
import { parseManifest, isSafePythonEntrypoint } from '../src/lib/floom/manifest.ts';
import {
  REDACTED_OUTPUT_VALUE,
  redactSecretOutput,
  validateJsonSchemaValue,
} from '../src/lib/floom/schema.ts';
import { resolveMcpForwardOrigin } from '../src/lib/mcp/origin.ts';
import { callFloomTool, floomTools } from '../src/lib/mcp/tools.ts';

function parseToolResult(result) {
  return JSON.parse(result.content[0].text);
}

function normalizeSql(text) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function assertSqlContains(sql, fragment) {
  assert.ok(
    normalizeSql(sql).includes(normalizeSql(fragment)),
    `missing SQL fragment: ${fragment}`
  );
}

async function test() {
  const toolNames = floomTools.map((tool) => tool.name);
  for (const toolName of [
    'auth_status',
    'validate_manifest',
    'publish_app',
    'find_candidate_apps',
    'get_app',
    'run_app',
    'create_agent_token',
  ]) {
    assert.ok(toolNames.includes(toolName), `missing MCP tool: ${toolName}`);
  }

  if (isSafePythonEntrypoint('my-app.py')) {
    throw new Error('hyphenated Python entrypoint accepted');
  }
  if (!isSafePythonEntrypoint('app.py')) {
    throw new Error('valid Python entrypoint rejected');
  }
  try {
    parseManifest({ name: 'Bad', slug: 'bad-app', runtime: 'python', entrypoint: 'my-app.py', handler: 'run' });
    throw new Error('invalid manifest accepted');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('entrypoint')) throw error;
  }

  const manifestText = readFileSync('fixtures/python-simple/floom.yaml', 'utf8');
  const inputSchemaText = readFileSync('fixtures/python-simple/input.schema.json', 'utf8');
  const outputSchemaText = readFileSync('fixtures/python-simple/output.schema.json', 'utf8');
  const sourceText = readFileSync('fixtures/python-simple/app.py', 'utf8');

  const validManifest = await callFloomTool(
    'validate_manifest',
    {
      manifest: manifestText,
      input_schema: inputSchemaText,
      output_schema: outputSchemaText,
    },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(validManifest.isError, undefined);
  assert.equal(parseToolResult(validManifest).valid, true);

  const invalidSchema = await callFloomTool(
    'validate_manifest',
    {
      manifest: manifestText,
      input_schema: { type: 'not-a-json-schema-type' },
    },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(invalidSchema.isError, true);
  assert.match(parseToolResult(invalidSchema).error, /metaschema/);

  const complexSchema = makeDeepSchema(14);
  const complexResult = validateJsonSchemaValue(complexSchema, 'input_schema');
  assert.equal(complexResult.ok, false);
  assert.match(complexResult.error, /too complex/);

  testSecretOutputRedaction();
  testPublicRunRateLimitHardening();
  await testSandboxErrorContainment();

  const authStatus = await callFloomTool('auth_status', {}, { baseUrl: 'http://localhost:3000' });
  assert.equal(authStatus.isError, undefined);
  assert.equal(parseToolResult(authStatus).authenticated, false);

  const candidates = await callFloomTool(
    'find_candidate_apps',
    {
      files: {
        'fixtures/python-simple/floom.yaml': manifestText,
        'fixtures/python-simple/input.schema.json': inputSchemaText,
        'fixtures/python-simple/output.schema.json': outputSchemaText,
        'fixtures/python-simple/app.py': sourceText,
      },
    },
    { baseUrl: 'http://localhost:3000' }
  );
  assert.equal(candidates.isError, undefined);
  assert.equal(parseToolResult(candidates).candidates[0].valid, true);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://localhost:3000/api/apps');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    const form = init.body;
    assert.equal(await form.get('bundle').text(), sourceText);
    assert.match(await form.get('manifest').text(), /slug: pitch-coach/);
    return new Response(JSON.stringify({ app: { slug: 'pitch-coach' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const publishResult = await callFloomTool(
      'publish_app',
      {
        manifest: manifestText,
        source: sourceText,
        input_schema: inputSchemaText,
        output_schema: outputSchemaText,
      },
      { baseUrl: 'http://localhost:3000', authorization: 'Bearer test-token' }
    );
    assert.notEqual(publishResult.isError, true);
    assert.equal(parseToolResult(publishResult).app.slug, 'pitch-coach');
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => {
    throw new Error('network failed for Bearer secret-token');
  };
  try {
    const failedTool = await callFloomTool(
      'get_app',
      { slug: 'pitch-coach' },
      { baseUrl: 'https://floom.example.com', authorization: 'Bearer secret-token' }
    );
    assert.equal(failedTool.isError, true);
    assert.doesNotMatch(failedTool.content[0].text, /secret-token/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  testMcpOriginResolution();

  const failClosedEnv = snapshotEnv([
    'E2B_API_KEY',
    'FLOOM_EXECUTION_MODE',
    'FLOOM_FAKE_E2B',
    'NODE_ENV',
  ]);
  delete process.env.E2B_API_KEY;
  delete process.env.FLOOM_EXECUTION_MODE;
  delete process.env.FLOOM_FAKE_E2B;
  process.env.NODE_ENV = 'production';
  try {
    const closedResult = await runInSandbox(
      'def run(inputs): return {"result": "hello"}',
      { name: 'Floom' },
      'python',
      'app.py',
      'run'
    );
    assert.equal(closedResult.error, 'E2B execution is not configured');
  } finally {
    restoreEnv(failClosedEnv);
  }

  process.env.FLOOM_EXECUTION_MODE = 'fake';

  const result = await runInSandbox(
    'def run(inputs): return {"result": "hello"}',
    { name: 'Floom' },
    'python',
    'app.py',
    'run',
    { python: [] }
  );

  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.output?.result === 'hello from fake mode') {
    console.log('✅ Fake mode works');
  } else {
    console.log('❌ Unexpected output');
    process.exit(1);
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

function testSecretOutputRedaction() {
  const outputSchema = {
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
        additionalProperties: { type: 'string', secret: true },
      },
    },
  };
  outputSchema.$defs.RefRow = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      row_secret: { type: 'string', secret: true },
    },
  };

  const output = {
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
    dynamic: { api_key: 'dynamic-private' },
  };

  assert.deepEqual(redactSecretOutput(outputSchema, output), {
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
    dynamic: { api_key: REDACTED_OUTPUT_VALUE },
  });
  assert.equal(output.token, 'secret-token');
  assert.equal(output.rows[0].row_secret, 'row-private');
}

function testPublicRunRateLimitHardening() {
  const routeText = readFileSync('src/app/api/apps/[slug]/run/route.ts', 'utf8');
  const migrationText = readFileSync('supabase/migrations/0001_core.sql', 'utf8');

  assert.equal(getPublicRunRateLimitKey('app_123'), 'public-run:app_123:anonymous');
  assert.match(routeText, /check_public_run_rate_limit/);
  assert.ok(
    routeText.indexOf('checkPublicRunRateLimit') < routeText.indexOf('runInSandboxContained('),
    'public run rate limit must run before sandbox execution'
  );
  assert.match(routeText, /getPublicRunRateLimitKey\(appId\)/);
  assert.doesNotMatch(routeText, /x-forwarded-for|cf-connecting-ip|x-real-ip/);
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
  assertSqlContains(migrationText, 'values (\'app-bundles\', \'app-bundles\', false, 1048576) on conflict (id) do nothing');
  assert.doesNotMatch(migrationText, /create or replace function public\.set_updated_at\(\)/);
  assert.doesNotMatch(migrationText, /create or replace function public\.handle_new_user\(\)/);
  assert.doesNotMatch(migrationText, /drop trigger if exists on_auth_user_created on auth\.users/);
  assert.doesNotMatch(migrationText, /on conflict \(id\) do update\s+set public = excluded\.public/);
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

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
