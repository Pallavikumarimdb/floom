import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const apiUrl = requiredEnv('FLOOM_API_URL').replace(/\/+$/, '');
const token = requiredEnv('FLOOM_TOKEN');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const suffix = `${runId}-${randomBytes(3).toString('hex')}`;
const secretValue = process.env.FLOOM_V01_TEST_SECRET || `floom-secret-${randomBytes(18).toString('hex')}`;

const dependencySlug = `req-gate-${suffix}`;
const secretSlug = `secret-gate-${suffix}`;
const publicSecretSlug = `public-secret-gate-${suffix}`;

const results = [];

await main();

async function main() {
  console.log(JSON.stringify({
    gate: 'v0.1-live',
    api_url: apiUrl,
    dependency_slug: dependencySlug,
    secret_slug: secretSlug,
  }, null, 2));

  await publishDependencyAppViaMcp();
  await runDependencyAppThroughRest();
  await runDependencyAppThroughMcp();

  await assertPublicSecretAppRejected();
  await publishSecretAppViaMcp();
  await assertMissingSecretFailsBeforeRun();
  await setSecretValue();
  await assertSecretMetadataOnly();
  await runSecretAppThroughRest();
  await runSecretAppThroughMcp();
  await verifyOptionalSupabaseEvidence();

  console.log(JSON.stringify({ ok: true, checks: results }, null, 2));
}

async function publishDependencyAppViaMcp() {
  const fixture = readFixture('python-requirements');
  const result = await mcpTool('publish_app', {
    manifest: withSlug(fixture.manifest, dependencySlug),
    source: fixture.source,
    input_schema: fixture.inputSchema,
    output_schema: fixture.outputSchema,
    requirements: fixture.requirements,
  });
  assert.equal(result.app.slug, dependencySlug);
  pass('mcp_publish_dependency_app');
}

async function runDependencyAppThroughRest() {
  const data = await apiJson(`/api/apps/${dependencySlug}/run`, {
    method: 'POST',
    body: { inputs: { count: 1234567 } },
  });
  assert.equal(data.status, 'success');
  assert.equal(data.output.formatted, '1,234,567');
  assert.equal(data.output.package, 'humanize');
  pass('rest_run_dependency_app');
}

async function runDependencyAppThroughMcp() {
  const data = await mcpTool('run_app', {
    slug: dependencySlug,
    inputs: { count: 987654 },
  });
  assert.equal(data.status, 'success');
  assert.equal(data.output.formatted, '987,654');
  pass('mcp_run_dependency_app');
}

async function assertPublicSecretAppRejected() {
  const fixture = readFixture('python-secret');
  const result = await mcpToolRaw('publish_app', {
    manifest: withSlug(fixture.manifest.replace('public: false', 'public: true'), publicSecretSlug),
    source: fixture.source,
    input_schema: fixture.inputSchema,
    output_schema: fixture.outputSchema,
  });
  assert.equal(result.isError, true);
  assert.match(JSON.parse(result.content[0].text).error, /Secret-backed apps must be private/);
  pass('public_secret_app_rejected');
}

async function publishSecretAppViaMcp() {
  const fixture = readFixture('python-secret');
  const result = await mcpTool('publish_app', {
    manifest: withSlug(fixture.manifest, secretSlug),
    source: fixture.source,
    input_schema: fixture.inputSchema,
    output_schema: fixture.outputSchema,
  });
  assert.equal(result.app.slug, secretSlug);
  pass('mcp_publish_secret_app');
}

async function assertMissingSecretFailsBeforeRun() {
  const data = await apiJson(`/api/apps/${secretSlug}/run`, {
    method: 'POST',
    body: { inputs: { message: 'missing secret check' } },
    expectedStatus: 400,
  });
  assert.match(data.error, /Missing configured app secret/);
  pass('missing_secret_fails');
}

async function setSecretValue() {
  const data = await apiJson(`/api/apps/${secretSlug}/secrets`, {
    method: 'PUT',
    body: { name: 'FLOOM_TEST_SECRET', value: secretValue },
  });
  assert.equal(data.secret.name, 'FLOOM_TEST_SECRET');
  assert.equal(data.secret.value, undefined);
  assertNoSecret(data, 'set-secret response');
  pass('secret_set_metadata_only');
}

async function assertSecretMetadataOnly() {
  const data = await apiJson(`/api/apps/${secretSlug}/secrets`, {
    method: 'GET',
  });
  assert.equal(data.secrets.length, 1);
  assert.equal(data.secrets[0].name, 'FLOOM_TEST_SECRET');
  assert.equal(data.secrets[0].value, undefined);
  assertNoSecret(data, 'list-secret response');
  pass('secret_list_metadata_only');
}

async function runSecretAppThroughRest() {
  const data = await apiJson(`/api/apps/${secretSlug}/run`, {
    method: 'POST',
    body: { inputs: { message: 'rest secret check' } },
  });
  assertSecretRunResult(data, 'rest secret run');
  pass('rest_run_secret_app_redacted');
}

async function runSecretAppThroughMcp() {
  const data = await mcpTool('run_app', {
    slug: secretSlug,
    inputs: { message: 'mcp secret check' },
  });
  assertSecretRunResult(data, 'mcp secret run');
  pass('mcp_run_secret_app_redacted');
}

async function verifyOptionalSupabaseEvidence() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    pass('supabase_evidence_skipped_no_service_role');
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { data: app, error: appError } = await admin
    .from('apps')
    .select('id, owner_id, slug, public, app_versions(id, dependencies, secrets)')
    .eq('slug', secretSlug)
    .single();
  if (appError) throw appError;
  assert.equal(app.public, false);
  assert.deepEqual(app.app_versions[0].secrets, ['FLOOM_TEST_SECRET']);
  assertNoSecret(app, 'apps/app_versions evidence');

  const { data: secrets, error: secretsError } = await admin
    .from('app_secrets')
    .select('name, value_ciphertext')
    .eq('app_id', app.id);
  if (secretsError) throw secretsError;
  assert.equal(secrets.length, 1);
  assert.equal(secrets[0].name, 'FLOOM_TEST_SECRET');
  assert.match(secrets[0].value_ciphertext, /^v1:/);
  assertNoSecret(secrets, 'app_secrets evidence');

  const { data: executions, error: execError } = await admin
    .from('executions')
    .select('input, output, status, error')
    .eq('app_id', app.id)
    .order('created_at', { ascending: false })
    .limit(5);
  if (execError) throw execError;
  assert.ok(executions.some((execution) => execution.status === 'success'));
  assertNoSecret(executions, 'executions evidence');
  pass('supabase_evidence_secret_not_persisted');
}

function assertSecretRunResult(data, label) {
  assert.equal(data.status, 'success');
  assert.equal(data.output.result, '[REDACTED]');
  assert.equal(data.output.secret_present, true);
  assert.equal(data.output.secret_length, secretValue.length);
  assertNoSecret(data, label);
}

async function mcpTool(name, args) {
  const result = await mcpToolRaw(name, args);
  assert.notEqual(result.isError, true, `${name} failed: ${JSON.stringify(result)}`);
  return JSON.parse(result.content[0].text);
}

async function mcpToolRaw(name, args) {
  const response = await fetch(`${apiUrl}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${name}-${Date.now()}`,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const payload = await response.json();
  if (payload.error) {
    throw new Error(`MCP JSON-RPC error: ${payload.error.message}`);
  }
  return payload.result;
}

async function apiJson(path, { method, body, expectedStatus = 200 } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (response.status !== expectedStatus) {
    throw new Error(`${method || 'GET'} ${path} returned ${response.status}: ${text}`);
  }
  return data;
}

function readFixture(name) {
  const root = join('fixtures', name);
  return {
    manifest: readFileSync(join(root, 'floom.yaml'), 'utf8'),
    source: readFileSync(join(root, 'app.py'), 'utf8'),
    inputSchema: readFileSync(join(root, 'input.schema.json'), 'utf8'),
    outputSchema: readFileSync(join(root, 'output.schema.json'), 'utf8'),
    requirements: fileOrNull(join(root, 'requirements.txt')),
  };
}

function fileOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

function withSlug(manifest, slug) {
  return manifest.replace(/^slug: .+$/m, `slug: ${slug}`);
}

function assertNoSecret(value, label) {
  const text = JSON.stringify(value);
  assert.equal(text.includes(secretValue), false, `${label} leaked the raw secret value`);
}

function pass(name) {
  results.push({ name, ok: true });
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
