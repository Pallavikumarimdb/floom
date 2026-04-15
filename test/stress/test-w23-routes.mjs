#!/usr/bin/env node
// W2.3 routes tests. Exercises /api/connections via the exported Hono
// router (no server boot). Validates:
//
//   - POST /initiate happy path + input validation
//   - POST /finish happy path + wrong owner → 404
//   - GET / filter by status
//   - DELETE /:provider happy path + bogus provider → 400
//   - Error envelope shape
//   - Session cookie is minted on first call
//
// Uses the in-memory fake Composio client injected via setComposioClient.
//
// Run: node test/stress/test-w23-routes.mjs

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'floom-w23-routes-'));
process.env.DATA_DIR = tmp;
process.env.FLOOM_DISABLE_JOB_WORKER = 'true';
process.env.FLOOM_MASTER_KEY =
  '0'.repeat(16) + '1'.repeat(16) + '2'.repeat(16) + '3'.repeat(16);
process.env.COMPOSIO_AUTH_CONFIG_GMAIL = 'ac_gmail_test';
process.env.COMPOSIO_AUTH_CONFIG_NOTION = 'ac_notion_test';
process.env.COMPOSIO_AUTH_CONFIG_STRIPE = 'ac_stripe_test';

const { db } = await import('../../apps/server/dist/db.js');
const { connectionsRouter } = await import(
  '../../apps/server/dist/routes/connections.js'
);
const composio = await import('../../apps/server/dist/services/composio.js');

let passed = 0;
let failed = 0;
function log(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ' :: ' + detail : ''}`);
  }
}

console.log('W2.3 route tests');

// ---- in-memory fake client ----
function makeFakeClient() {
  const state = {
    accounts: new Map(),
    initiateCalls: [],
    deleteCalls: [],
    nextId: 1,
  };
  return {
    state,
    client: {
      connectedAccounts: {
        async initiate(userId, authConfigId, options) {
          state.initiateCalls.push({ userId, authConfigId, options });
          const id = `fake_${state.nextId++}`;
          state.accounts.set(id, {
            id,
            status: 'INITIATED',
            toolkit: { slug: authConfigId.replace('ac_', '').replace('_test', '') },
            data: { email: `${userId.replace(/[^a-z0-9]/gi, '')}@example.com` },
          });
          return {
            id,
            status: 'INITIATED',
            redirectUrl: `https://composio.dev/oauth/${id}`,
          };
        },
        async get(id) {
          const a = state.accounts.get(id);
          if (!a) throw new Error('not found');
          if (a.status === 'INITIATED') a.status = 'ACTIVE';
          return { id, status: a.status, toolkit: a.toolkit, data: a.data };
        },
        async delete(id) {
          state.deleteCalls.push(id);
          state.accounts.delete(id);
          return { success: true, id };
        },
      },
      tools: {
        async execute() {
          return { data: {}, successful: true };
        },
      },
    },
  };
}

const { client, state } = makeFakeClient();
composio.setComposioClient(client);

// ---- helper: issue a request through the Hono router, preserving cookies ----
async function fetchRoute(router, method, path, body, cookie) {
  const url = `http://localhost${path}`;
  const init = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  if (cookie) {
    init.headers = { ...(init.headers || {}), cookie };
  }
  const req = new Request(url, init);
  const res = await router.fetch(req);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave null
  }
  return { status: res.status, json, text, headers: res.headers };
}

// ---- 1. POST /initiate: valid body ----
let r = await fetchRoute(connectionsRouter, 'POST', '/initiate', {
  provider: 'gmail',
  callback_url: 'https://floom.dev/cb',
});
log('POST /initiate gmail: 200', r.status === 200, `got ${r.status}`);
log('POST /initiate: returns auth_url', r.json && typeof r.json.auth_url === 'string');
log('POST /initiate: returns connection_id', r.json && typeof r.json.connection_id === 'string');
log('POST /initiate: returns expires_at', r.json && typeof r.json.expires_at === 'string');

// The session cookie is issued with the first request. Capture it so
// subsequent calls reuse the same device id.
const setCookie = r.headers.get('set-cookie') || '';
const match = /floom_device=([^;]+)/.exec(setCookie);
const deviceCookie = match ? `floom_device=${match[1]}` : null;
log('POST /initiate: mints floom_device cookie', !!deviceCookie);

// Composio was called with device:* userId
const lastInit = state.initiateCalls[state.initiateCalls.length - 1];
log(
  'POST /initiate: fake Composio got device: userId',
  lastInit?.userId?.startsWith('device:'),
);

const gmailConnectionId = r.json.connection_id;

// ---- 2. POST /initiate: bad body → 400 ----
r = await fetchRoute(connectionsRouter, 'POST', '/initiate', { foo: 'bar' });
log('POST /initiate bad body: 400', r.status === 400);
log("POST /initiate bad body: code='invalid_body'", r.json?.code === 'invalid_body');

// ---- 3. POST /initiate: bad provider format → 400 ----
r = await fetchRoute(connectionsRouter, 'POST', '/initiate', {
  provider: 'BadProvider!',
});
log('POST /initiate bad slug: 400', r.status === 400);

// ---- 4. POST /initiate: missing env config → 400 ----
// airtable has no env var set → ComposioConfigError → 400 code=composio_config_missing
r = await fetchRoute(connectionsRouter, 'POST', '/initiate', {
  provider: 'airtable',
});
log(
  'POST /initiate airtable (no env): 400',
  r.status === 400,
  `got ${r.status}`,
);
log(
  "POST /initiate airtable: code='composio_config_missing'",
  r.json?.code === 'composio_config_missing',
);

// ---- 5. POST /finish: valid ----
r = await fetchRoute(
  connectionsRouter,
  'POST',
  '/finish',
  { connection_id: gmailConnectionId },
  deviceCookie,
);
log('POST /finish: 200', r.status === 200, `got ${r.status}`);
log('POST /finish: status=active', r.json?.connection?.status === 'active');
log('POST /finish: metadata has account_email', r.json?.connection?.metadata?.account_email);

// ---- 6. POST /finish: wrong owner → 404 ----
r = await fetchRoute(
  connectionsRouter,
  'POST',
  '/finish',
  { connection_id: gmailConnectionId },
  // no cookie → mints a new device, so the finish lookup fails
);
log('POST /finish wrong owner: 404', r.status === 404, `got ${r.status}`);
log(
  "POST /finish wrong owner: code='connection_not_found'",
  r.json?.code === 'connection_not_found',
);

// ---- 7. POST /finish: bad body → 400 ----
r = await fetchRoute(
  connectionsRouter,
  'POST',
  '/finish',
  { wrong: 'shape' },
  deviceCookie,
);
log('POST /finish bad body: 400', r.status === 400);

// ---- 8. GET / : returns list scoped to caller ----
r = await fetchRoute(connectionsRouter, 'GET', '/', undefined, deviceCookie);
log('GET /: 200', r.status === 200);
log('GET /: 1 connection', r.json?.connections?.length === 1);
log('GET /: gmail active', r.json?.connections?.[0]?.provider === 'gmail');

// ---- 9. GET /?status=pending → 0 rows ----
r = await fetchRoute(
  connectionsRouter,
  'GET',
  '/?status=pending',
  undefined,
  deviceCookie,
);
log('GET /?status=pending: 0 rows', r.json?.connections?.length === 0);

// ---- 10. GET /?status=bogus → 400 ----
r = await fetchRoute(
  connectionsRouter,
  'GET',
  '/?status=bogus',
  undefined,
  deviceCookie,
);
log('GET /?status=bogus: 400', r.status === 400);

// ---- 11. connect a second provider (notion) ----
r = await fetchRoute(
  connectionsRouter,
  'POST',
  '/initiate',
  { provider: 'notion' },
  deviceCookie,
);
log('POST /initiate notion: 200', r.status === 200);
const notionId = r.json.connection_id;
await fetchRoute(
  connectionsRouter,
  'POST',
  '/finish',
  { connection_id: notionId },
  deviceCookie,
);
r = await fetchRoute(connectionsRouter, 'GET', '/', undefined, deviceCookie);
log('GET /: now 2 connections', r.json?.connections?.length === 2);

// ---- 12. DELETE /:provider happy path ----
r = await fetchRoute(
  connectionsRouter,
  'DELETE',
  '/notion',
  undefined,
  deviceCookie,
);
log('DELETE /notion: 200', r.status === 200);
log('DELETE /notion: status=revoked', r.json?.connection?.status === 'revoked');
log('DELETE /notion: fake Composio.delete called', state.deleteCalls.includes(notionId));

// ---- 13. DELETE unknown provider → 404 ----
r = await fetchRoute(
  connectionsRouter,
  'DELETE',
  '/stripe',
  undefined,
  deviceCookie,
);
log('DELETE /stripe (not connected): 404', r.status === 404);

// ---- 14. DELETE with invalid slug → 400 ----
r = await fetchRoute(
  connectionsRouter,
  'DELETE',
  '/BadSlug!',
  undefined,
  deviceCookie,
);
log('DELETE /BadSlug!: 400', r.status === 400);

// ---- 15. cross-owner isolation: a new device cookie can't see gmail ----
r = await fetchRoute(connectionsRouter, 'GET', '/', undefined, 'floom_device=other-device');
log(
  'GET / with different cookie: empty list (isolation)',
  r.status === 200 && r.json?.connections?.length === 0,
);

// ---- 16. body must be JSON ----
// Simulate a non-JSON body
const badReq = new Request('http://localhost/initiate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: 'not json',
});
const badRes = await connectionsRouter.fetch(badReq);
const badJson = await badRes.json().catch(() => null);
log('POST /initiate non-JSON: 400', badRes.status === 400);
log(
  "POST /initiate non-JSON: code='invalid_body'",
  badJson?.code === 'invalid_body',
);

// ---- 17. HttpOnly + SameSite cookie on mint ----
const sc = setCookie || '';
log('session cookie: HttpOnly', sc.includes('HttpOnly'));
log('session cookie: SameSite=Lax', sc.includes('SameSite=Lax'));

// ---- cleanup ----
db.close();
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
