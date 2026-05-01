import { createHmac, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const apiUrl = normalizeApiUrl(requiredEnv('FLOOM_API_URL'));
const token = requiredEnv('FLOOM_TOKEN');
const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const agentTokenPepper = requiredEnv('AGENT_TOKEN_PEPPER');
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const suffix = `${runId}-${randomBytes(3).toString('hex')}`;
const secretValue = process.env.FLOOM_V01_TEST_SECRET || `floom-secret-${randomBytes(18).toString('hex')}`;

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const dependencySlug = `req-gate-${suffix}`;
const secretSlug = `secret-gate-${suffix}`;
const publicSecretSlug = `public-secret-gate-${suffix}`;
const tempSecretName = 'FLOOM_TEMP_SECRET';
const tempSecretValue = `temporary-live-gate-${randomBytes(12).toString('hex')}`;
const results = [];
const cleanupState = {
  slugs: [dependencySlug, secretSlug, publicSecretSlug],
  tokenIds: [],
  userIds: [],
  tempDirs: [],
};

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: safeErrorMessage(error) }, null, 2));
  process.exitCode = 1;
} finally {
  try {
    await cleanupLiveArtifacts();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      cleanup_failed: true,
      error: safeErrorMessage(error),
    }, null, 2));
    process.exitCode = 1;
  }
}

async function main() {
  console.log(JSON.stringify({
    gate: 'v0.1-live',
    api_url: apiUrl,
    dependency_slug: dependencySlug,
    secret_slug: secretSlug,
  }, null, 2));

  await publishDependencyAppViaCli();
  await publishDependencyAppViaMcp();
  await runDependencyAppThroughRest();
  await runDependencyAppThroughMcp();

  await assertPublicSecretAppRejected();
  await publishSecretAppViaMcp();
  await assertMetadataAndPageAccess();
  await assertSecretRouteAuthNegatives();
  await assertMissingSecretFailsBeforeRun();
  await setSecretValueViaCli();
  await assertSecretMetadataOnlyViaCli();
  await assertSecretDeleteViaCli();
  await assertScopedAndNonOwnerAccessControls();
  await runSecretAppThroughRest();
  await runSecretAppThroughMcp();
  await verifySupabaseEvidence();

  console.log(JSON.stringify({ ok: true, checks: results }, null, 2));
}

async function publishDependencyAppViaCli() {
  const appDir = makeTempFixture('python-requirements', dependencySlug, { publicApp: true });
  const output = runCli('npx', ['tsx', 'cli/deploy.ts', appDir]);
  check(output.includes(`/p/${dependencySlug}`), 'CLI dependency publish did not return expected app URL');
  pass('cli_publish_dependency_app');
}

async function publishDependencyAppViaMcp() {
  const mcpDependencySlug = `${dependencySlug}-mcp`;
  cleanupState.slugs.push(mcpDependencySlug);
  const fixture = readFixture('python-requirements');
  const result = await mcpTool('publish_app', {
    manifest: withSlug(fixture.manifest, mcpDependencySlug),
    source: fixture.source,
    input_schema: fixture.inputSchema,
    output_schema: fixture.outputSchema,
    requirements: fixture.requirements,
  });
  check(result.app?.slug === mcpDependencySlug, 'MCP dependency app publish returned unexpected slug');
  const run = await mcpTool('run_app', {
    slug: mcpDependencySlug,
    inputs: { count: 654321 },
  });
  check(run.status === 'success', 'MCP-published dependency run did not succeed');
  check(run.output?.formatted === '654,321', 'MCP-published dependency run returned unexpected formatted output');
  pass('mcp_publish_dependency_app');
}

async function runDependencyAppThroughRest() {
  const data = await apiJson(`/api/apps/${dependencySlug}/run`, {
    method: 'POST',
    body: { inputs: { count: 1234567 } },
  });
  check(data.status === 'success', 'REST dependency run did not succeed');
  check(data.output?.formatted === '1,234,567', 'REST dependency run returned unexpected formatted output');
  check(data.output?.package === 'humanize', 'REST dependency run did not use dependency output');
  pass('rest_run_dependency_app');
}

async function runDependencyAppThroughMcp() {
  const data = await mcpTool('run_app', {
    slug: dependencySlug,
    inputs: { count: 987654 },
  });
  check(data.status === 'success', 'MCP dependency run did not succeed');
  check(data.output?.formatted === '987,654', 'MCP dependency run returned unexpected formatted output');
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
  check(result.isError === true, 'public secret-backed app publish unexpectedly succeeded');
  const text = JSON.parse(result.content[0].text);
  check(/Secret-backed apps must be private/.test(text.error), 'public secret-backed app error was unexpected');
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
  check(result.app?.slug === secretSlug, 'MCP secret app publish returned unexpected slug');
  pass('mcp_publish_secret_app');
}

async function assertMetadataAndPageAccess() {
  const publicMetadata = await apiJson(`/api/apps/${dependencySlug}`, {
    method: 'GET',
    authToken: null,
  });
  check(publicMetadata.slug === dependencySlug, 'public app metadata returned unexpected slug');
  check(publicMetadata.public === true, 'public app metadata did not mark app public');

  await assertPageLoad(dependencySlug, {
    authToken: null,
    expectedStatus: 200,
    expectedText: 'Requirements Formatter',
    label: 'public app page',
  });

  const privateMetadata = await apiJson(`/api/apps/${secretSlug}`, {
    method: 'GET',
  });
  check(privateMetadata.slug === secretSlug, 'private owner metadata returned unexpected slug');
  check(privateMetadata.public === false, 'private owner metadata did not mark app private');

  await apiJson(`/api/apps/${secretSlug}`, {
    method: 'GET',
    authToken: null,
    expectedStatus: 404,
  });

  await assertPageLoad(secretSlug, {
    authToken: null,
    expectedStatus: 200,
    expectedText: 'App not found',
    label: 'private anonymous app page shell',
  });
  pass('metadata_and_page_access');
}

async function assertSecretRouteAuthNegatives() {
  const fixture = readFixture('python-secret');
  await assertMcpError('publish_app', {
    manifest: withSlug(fixture.manifest, `unauth-secret-${suffix}`),
    source: fixture.source,
    input_schema: fixture.inputSchema,
    output_schema: fixture.outputSchema,
  }, {
    authToken: null,
    expectedError: /Unauthorized/,
    label: 'unauthenticated publish_app',
  });

  await assertMcpError('get_app', { slug: secretSlug }, {
    authToken: null,
    expectedError: /App not found/,
    label: 'unauthenticated private get_app',
  });
  await assertMcpError('run_app', {
    slug: secretSlug,
    inputs: { message: 'anonymous mcp secret run' },
  }, {
    authToken: null,
    expectedError: /Forbidden/,
    label: 'unauthenticated private run_app',
  });
  await assertMcpError('get_app', { slug: secretSlug }, {
    authToken: 'not-a-valid-token',
    expectedError: /App not found/,
    label: 'invalid-token private get_app',
  });
  await assertMcpError('run_app', {
    slug: secretSlug,
    inputs: { message: 'invalid token mcp secret run' },
  }, {
    authToken: 'not-a-valid-token',
    expectedError: /Unauthorized/,
    label: 'invalid-token private run_app',
  });

  await apiJson(`/api/apps/${secretSlug}/secrets`, {
    method: 'GET',
    authToken: null,
    expectedStatus: 401,
  });
  await apiJson(`/api/apps/${secretSlug}/secrets`, {
    method: 'GET',
    authToken: 'not-a-valid-token',
    expectedStatus: 401,
  });
  await apiJson(`/api/apps/${secretSlug}/run`, {
    method: 'POST',
    authToken: null,
    body: { inputs: { message: 'anonymous secret run' } },
    expectedStatus: 403,
  });
  pass('secret_route_auth_negatives');
}

async function assertMissingSecretFailsBeforeRun() {
  const data = await apiJson(`/api/apps/${secretSlug}/run`, {
    method: 'POST',
    body: { inputs: { message: 'missing secret check' } },
    expectedStatus: 400,
  });
  check(/Missing configured app secret/.test(data.error), 'missing secret error was unexpected');
  pass('missing_secret_fails');
}

async function setSecretValueViaCli() {
  const data = runSecretsCliJson(['set', secretSlug, 'FLOOM_TEST_SECRET'], secretValue);
  assertNoSecret(data, 'set-secret CLI response');
  check(data.secret?.name === 'FLOOM_TEST_SECRET', 'set-secret CLI response missing metadata');

  const tempData = runSecretsCliJson(['set', secretSlug, tempSecretName], tempSecretValue);
  assertNoSecret(tempData, 'set temp secret CLI response');
  check(tempData.secret?.name === tempSecretName, 'set temp secret CLI response missing metadata');
  pass('secret_set_metadata_only_cli');
}

async function assertSecretMetadataOnlyViaCli() {
  const data = runSecretsCliJson(['list', secretSlug]);
  assertNoSecret(data, 'list-secret CLI response');
  const names = data.secrets.map((item) => item.name).sort();
  check(names.includes('FLOOM_TEST_SECRET'), 'list-secret CLI response missing required secret');
  check(names.includes(tempSecretName), 'list-secret CLI response missing temp secret');
  check(data.secrets.every((item) => item.value === undefined), 'list-secret CLI response exposed a value field');
  pass('secret_list_metadata_only_cli');
}

async function assertSecretDeleteViaCli() {
  const data = runSecretsCliJson(['delete', secretSlug, tempSecretName]);
  check(data.deleted === true, 'delete-secret CLI response did not confirm deletion');
  const listed = runSecretsCliJson(['list', secretSlug]);
  const names = listed.secrets.map((item) => item.name);
  check(!names.includes(tempSecretName), 'deleted temp secret still appears in list response');
  pass('secret_delete_cli');
}

async function assertScopedAndNonOwnerAccessControls() {
  const app = await fetchAppForCleanup(secretSlug);
  const readOnlyToken = await createScopedAgentToken(app.owner_id, ['read']);
  const otherUser = await createTemporaryUser();
  const otherToken = await createScopedAgentToken(otherUser.id, ['read', 'run', 'publish']);
  const fixture = readFixture('python-secret');

  await assertMcpError('publish_app', {
    manifest: withSlug(fixture.manifest, `read-only-secret-${suffix}`),
    source: fixture.source,
    input_schema: fixture.inputSchema,
    output_schema: fixture.outputSchema,
  }, {
    authToken: readOnlyToken.token,
    expectedError: /publish scope/,
    label: 'read-only publish_app',
  });

  const readOnlyMetadata = await mcpTool('get_app', { slug: secretSlug }, readOnlyToken.token);
  check(readOnlyMetadata.slug === secretSlug, 'read-only MCP get_app returned unexpected slug');
  await assertMcpError('run_app', {
    slug: secretSlug,
    inputs: { message: 'read-only mcp secret run' },
  }, {
    authToken: readOnlyToken.token,
    expectedError: /Missing run scope/,
    label: 'read-only private run_app',
  });
  await assertMcpError('get_app', { slug: secretSlug }, {
    authToken: otherToken.token,
    expectedError: /App not found/,
    label: 'non-owner private get_app',
  });
  await assertMcpError('run_app', {
    slug: secretSlug,
    inputs: { message: 'non-owner mcp secret run' },
  }, {
    authToken: otherToken.token,
    expectedError: /Forbidden/,
    label: 'non-owner private run_app',
  });

  await apiJson(`/api/apps/${secretSlug}/secrets`, {
    method: 'PUT',
    authToken: readOnlyToken.token,
    body: { name: tempSecretName, value: 'blocked' },
    expectedStatus: 403,
  });
  await apiJson(`/api/apps/${secretSlug}/run`, {
    method: 'POST',
    authToken: readOnlyToken.token,
    body: { inputs: { message: 'missing run scope' } },
    expectedStatus: 403,
  });
  await apiJson(`/api/apps/${secretSlug}/secrets`, {
    method: 'GET',
    authToken: otherToken.token,
    expectedStatus: 404,
  });
  await apiJson(`/api/apps/${secretSlug}/run`, {
    method: 'POST',
    authToken: otherToken.token,
    body: { inputs: { message: 'non owner run' } },
    expectedStatus: 403,
  });
  pass('scoped_and_non_owner_access_controls');
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

async function verifySupabaseEvidence() {
  const app = await fetchAppForCleanup(secretSlug);
  check(app.public === false, 'secret app is not private in DB');
  check(arrayEquals(app.app_versions[0].secrets, ['FLOOM_TEST_SECRET']), 'app_versions secret names unexpected');
  assertNoSecret(app, 'apps/app_versions evidence');

  const { data: secrets, error: secretsError } = await admin
    .from('app_secrets')
    .select('name, value_ciphertext')
    .eq('app_id', app.id);
  if (secretsError) throw new Error('Failed to load app_secrets evidence');
  check(secrets.length === 1, 'unexpected app_secrets row count');
  check(secrets[0].name === 'FLOOM_TEST_SECRET', 'unexpected app secret name');
  check(/^v1:/.test(secrets[0].value_ciphertext), 'app secret ciphertext format unexpected');
  assertNoSecret(secrets, 'app_secrets evidence');

  const { data: executions, error: execError } = await admin
    .from('executions')
    .select('input, output, status, error')
    .eq('app_id', app.id)
    .order('created_at', { ascending: false })
    .limit(8);
  if (execError) throw new Error('Failed to load execution evidence');
  check(executions.some((execution) => execution.status === 'success'), 'no successful execution evidence found');
  assertNoSecret(executions, 'executions evidence');
  pass('supabase_evidence_secret_not_persisted');
}

function assertSecretRunResult(data, label) {
  assertNoSecret(data, label);
  check(data.status === 'success', `${label} did not succeed`);
  check(data.output?.result === '[REDACTED]', `${label} did not redact result`);
  check(data.output?.secret_present === true, `${label} did not observe injected secret`);
  check(data.output?.secret_length === secretValue.length, `${label} returned wrong secret length`);
}

async function mcpTool(name, args, authToken = token) {
  const result = await mcpToolRaw(name, args, authToken);
  if (result.isError === true) {
    throw new Error(`${name} returned an error result`);
  }
  const data = JSON.parse(result.content[0].text);
  assertNoSecret(data, `${name} MCP result`);
  return data;
}

async function mcpToolRaw(name, args, authToken = token) {
  const headers = { 'content-type': 'application/json' };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const response = await fetch(`${apiUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${name}-${Date.now()}`,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const text = await response.text();
  const payload = parseJson(text, 'MCP response was not JSON');
  if (payload.error) {
    throw new Error(`MCP JSON-RPC error: ${payload.error.message}`);
  }
  assertNoSecret(payload, 'MCP raw response');
  return payload.result;
}

async function assertMcpError(name, args, { authToken, expectedError, label }) {
  const result = await mcpToolRaw(name, args, authToken);
  check(result.isError === true, `${label} unexpectedly succeeded`);
  const data = JSON.parse(result.content[0].text);
  assertNoSecret(data, `${label} MCP error`);
  check(expectedError.test(data.error || ''), `${label} returned unexpected error`);
}

async function apiJson(path, { method, body, expectedStatus = 200, authToken = token } = {}) {
  const headers = {};
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  if (body) headers['content-type'] = 'application/json';

  const response = await fetch(`${apiUrl}${path}`, {
    method: method || 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? parseJson(text, `${method || 'GET'} ${path} returned invalid JSON`) : {};
  assertNoSecret(data, `${method || 'GET'} ${path} response`);
  if (response.status !== expectedStatus) {
    throw new Error(`${method || 'GET'} ${path} returned ${response.status}: ${redactString(text)}`);
  }
  return data;
}

async function assertPageLoad(slug, { authToken, expectedStatus, expectedText, label }) {
  const headers = {};
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const response = await fetch(`${apiUrl}/p/${slug}`, { method: 'GET', headers });
  const text = await response.text();
  assertNoSecret(text, `${label} HTML`);
  if (response.status !== expectedStatus) {
    throw new Error(`${label} returned ${response.status}: ${redactString(text.slice(0, 500))}`);
  }
  check(text.includes('__next'), `${label} did not contain Next page shell`);

  const hydratedText = dumpHydratedPageText(`${apiUrl}/p/${slug}`);
  assertNoSecret(hydratedText, `${label} hydrated text`);
  check(hydratedText.includes(expectedText), `${label} hydrated page did not contain expected text`);
}

function runCli(command, args, { input } = {}) {
  const env = cliEnv();
  const result = input === undefined
    ? execFileSync(command, args, { cwd: process.cwd(), env, encoding: 'utf8', stdio: 'pipe' })
    : spawnSync(command, args, { cwd: process.cwd(), env, input, encoding: 'utf8' });

  if (typeof result === 'string') {
    assertNoSecret(result, `${command} output`);
    return result;
  }

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assertNoSecret(output, `${command} output`);
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${redactString(output)}`);
  }
  return output;
}

function runSecretsCliJson(args, input) {
  const output = runCli('npx', ['tsx', 'cli/secrets.ts', ...args], { input });
  return parseJson(output, `cli/secrets.ts ${args[0]} returned invalid JSON`);
}

function makeTempFixture(name, slug, { publicApp = false } = {}) {
  const source = join('fixtures', name);
  const target = mkdtempSync(join(tmpdir(), `floom-${name}-`));
  cleanupState.tempDirs.push(target);
  cpSync(source, target, { recursive: true });
  let manifest = withSlug(readFileSync(join(target, 'floom.yaml'), 'utf8'), slug);
  if (publicApp) {
    manifest = manifest.replace(/^public: .+$/m, 'public: true');
  }
  writeFileSync(join(target, 'floom.yaml'), manifest);
  return target;
}

async function fetchAppForCleanup(slug) {
  const { data, error } = await admin
    .from('apps')
    .select('id, owner_id, slug, public, app_versions(id, bundle_path, dependencies, secrets)')
    .eq('slug', slug)
    .single();
  if (error) throw new Error(`Failed to load app evidence for ${slug}`);
  return data;
}

async function createScopedAgentToken(ownerId, scopes) {
  const raw = `flm_live_${randomBytes(6).toString('base64url')}_${randomBytes(32).toString('base64url')}`;
  const { data, error } = await admin
    .from('agent_tokens')
    .insert({
      owner_id: ownerId,
      name: `live-gate-${suffix}`,
      token_hash: createHmac('sha256', agentTokenPepper).update(raw, 'utf8').digest('hex'),
      token_prefix: raw.slice(0, 12),
      scopes,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error('Failed to create scoped test token');
  cleanupState.tokenIds.push(data.id);
  return { token: raw, id: data.id };
}

async function createTemporaryUser() {
  const email = `floom-live-gate-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(18).toString('base64url'),
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Failed to create non-owner test user');
  cleanupState.userIds.push(data.user.id);
  return data.user;
}

async function cleanupLiveArtifacts() {
  const failures = [];
  for (const slug of cleanupState.slugs) {
    await cleanupStep(`app ${slug}`, () => cleanupApp(slug), failures);
  }
  if (cleanupState.tokenIds.length > 0) {
    await cleanupStep('agent tokens', async () => {
      const { error } = await admin.from('agent_tokens').delete().in('id', cleanupState.tokenIds);
      if (error) throw new Error(error.message);
    }, failures);
  }
  for (const userId of cleanupState.userIds) {
    await cleanupStep(`auth user ${userId}`, async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    }, failures);
  }
  for (const dir of cleanupState.tempDirs) {
    await cleanupStep(`temp dir ${dir}`, async () => {
      rmSync(dir, { recursive: true, force: true });
    }, failures);
  }
  if (failures.length > 0) {
    throw new Error(`Live gate cleanup failed: ${failures.join('; ')}`);
  }
}

async function cleanupApp(slug) {
  const { data, error: loadError } = await admin
    .from('apps')
    .select('id, app_versions(bundle_path)')
    .eq('slug', slug)
    .maybeSingle();
  if (loadError) throw new Error(`load failed: ${loadError.message}`);
  if (!data) return;

  const bundlePaths = (data.app_versions || [])
    .map((version) => version.bundle_path)
    .filter(Boolean);
  if (bundlePaths.length > 0) {
    const { error: storageError } = await admin.storage.from('app-bundles').remove(bundlePaths);
    if (storageError) throw new Error(`storage remove failed: ${storageError.message}`);
  }
  const { error: deleteError } = await admin.from('apps').delete().eq('id', data.id);
  if (deleteError) throw new Error(`app delete failed: ${deleteError.message}`);
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

function cliEnv() {
  const env = {
    PATH: process.env.PATH || '',
    HOME: process.env.HOME || '',
    TMPDIR: process.env.TMPDIR || tmpdir(),
    TEMP: process.env.TEMP || tmpdir(),
    TMP: process.env.TMP || tmpdir(),
    CI: process.env.CI || '',
    NO_COLOR: process.env.NO_COLOR || '',
    FORCE_COLOR: process.env.FORCE_COLOR || '',
    FLOOM_API_URL: apiUrl,
    FLOOM_TOKEN: token,
  };
  assertChildEnvSafe(env);
  return env;
}

function assertChildEnvSafe(env) {
  const forbiddenNames = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'AGENT_TOKEN_PEPPER',
    'FLOOM_V01_TEST_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL',
  ];
  for (const name of forbiddenNames) {
    if (Object.prototype.hasOwnProperty.call(env, name)) {
      throw new Error(`child CLI env includes forbidden variable ${name}`);
    }
  }
  const serialized = JSON.stringify(env);
  if (serialized.includes(serviceRoleKey) || serialized.includes(agentTokenPepper) || serialized.includes(secretValue)) {
    throw new Error('child CLI env includes a forbidden secret value');
  }
}

async function cleanupStep(label, fn, failures) {
  try {
    await fn();
  } catch (error) {
    failures.push(`${label}: ${safeErrorMessage(error)}`);
  }
}

function dumpHydratedPageText(url) {
  const chrome = findChromeExecutable();
  const profileDir = mkdtempSync(join(tmpdir(), 'floom-live-gate-chrome-'));
  cleanupState.tempDirs.push(profileDir);
  const output = execFileSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${profileDir}`,
    '--virtual-time-budget=12000',
    '--dump-dom',
    url,
  ], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      TMPDIR: process.env.TMPDIR || tmpdir(),
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return output.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
}

function findChromeExecutable() {
  const candidates = [
    process.env.FLOOM_CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Headless Chrome is required for hydrated app page verification; set FLOOM_CHROME_BIN');
  }
  return found;
}

function assertNoSecret(value, label) {
  const serialized = JSON.stringify(value);
  if (sensitiveValues().some((secret) => serialized.includes(secret))) {
    throw new Error(`${label} leaked a sensitive value`);
  }
}

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pass(name) {
  results.push({ name, ok: true });
}

function parseJson(text, message) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(message);
  }
}

function safeErrorMessage(error) {
  return redactString(error instanceof Error ? error.message : String(error));
}

function redactString(text) {
  return sensitiveValues().reduce((redacted, secret) => redacted.split(secret).join('[REDACTED]'), text);
}

function sensitiveValues() {
  return [secretValue, tempSecretValue, serviceRoleKey, agentTokenPepper, token].filter(Boolean);
}

function normalizeApiUrl(value) {
  const url = new URL(value);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw new Error('FLOOM_API_URL must be https, except localhost may use http');
  }
  return url.toString().replace(/\/+$/, '');
}

function arrayEquals(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((item, index) => item === right[index]);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
