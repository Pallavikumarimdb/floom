#!/usr/bin/env node
// Dep Check — proxied-mode HTTP server. Clones a public git repo and scans
// JS/TS/Python source for imports that reference files that no longer exist.
//
// Pure Node.js; shells out to the system `git` binary. No external npm deps.
//
// Run: node examples/dep-check/server.mjs
// Env: PORT=4114 (default)

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve as pathResolve, relative, extname, isAbsolute } from 'node:path';

const PORT = Number(process.env.PORT || 4114);
const MAX_FILES_SCAN = 3000;
const MAX_FILE_BYTES = 500_000;

const spec = {
  openapi: '3.0.0',
  info: {
    title: 'Dep Check',
    version: '0.2.0',
    description:
      'Find dead imports in your project. Clone a public git repo and list any imports that reference files no longer present.',
  },
  servers: [{ url: `http://localhost:${PORT}` }],
  paths: {
    '/analyze': {
      post: {
        operationId: 'analyze',
        summary: 'Find dead imports in a repo',
        description:
          'Clone a public git repo and list JS/TS/Python imports that reference files that no longer exist.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['repo_url'],
                properties: {
                  repo_url: {
                    type: 'string',
                    description: 'Public HTTPS git URL.',
                  },
                  branch: {
                    type: 'string',
                    description: 'Optional branch or ref to check out.',
                    default: '',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Dead imports report',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: { type: 'number' },
                    dead_imports: { type: 'array' },
                    scanned_files: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ---------- git helpers ----------

function run(cmd, args, cwd, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const to = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (c) => (stdout += c.toString('utf-8')));
    child.stderr.on('data', (c) => (stderr += c.toString('utf-8')));
    child.on('error', (e) => {
      clearTimeout(to);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(to);
      if (code !== 0) return reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
      resolve(stdout);
    });
  });
}

function validateRepoUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error('repo_url is not a valid URL');
  }
  if (u.protocol !== 'https:') throw new Error('repo_url must use https://');
  if (!/^[\w.-]+$/.test(u.hostname)) throw new Error('repo_url hostname is invalid');
  return u.toString();
}

function sanitizeRef(ref) {
  if (!ref) return '';
  if (!/^[A-Za-z0-9._/~^-]+$/.test(ref)) throw new Error(`invalid ref: ${ref}`);
  return ref;
}

// ---------- dead-import detection ----------

const IMPORT_REGEXES = [
  // ESM:  import x from './foo'
  /import\s+(?:[\w*\s{},]+\s+from\s+)?['"]([^'"]+)['"]/g,
  // ESM:  import('./foo')
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // CJS:  require('./foo')
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Python: from .foo import x
  /^\s*from\s+(\.[\w.]+)\s+import\s+/gm,
  // Python: import .foo (unusual, safer to skip)
];

function walkSourceFiles(root, limit) {
  const SRC_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py']);
  const IGNORE = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'out',
    '.next',
    'venv',
    '.venv',
    '__pycache__',
    'coverage',
  ]);
  const out = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (out.length >= limit) break;
      if (IGNORE.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && SRC_EXT.has(extname(e.name))) out.push(full);
    }
  }
  return out;
}

function tryResolve(importer, spec, root) {
  // Only handle relative specifiers ("./x", "../x", ".x.y" python)
  if (isAbsolute(spec)) return { kind: 'skipped' };
  const firstChar = spec[0];
  if (firstChar !== '.' && firstChar !== '/') return { kind: 'skipped' }; // package import, ignore

  const importerDir = dirname(importer);
  // Python dotted relative: ".foo.bar" → resolve from the package containing
  // the importer.
  let candidatePath;
  if (firstChar === '.' && spec.length > 1 && !spec.startsWith('./') && !spec.startsWith('../')) {
    const up = (spec.match(/^\.+/) || [''])[0].length - 1;
    const rest = spec.slice(up + 1).replace(/\./g, '/');
    let base = importerDir;
    for (let i = 0; i < up; i++) base = dirname(base);
    candidatePath = join(base, rest);
  } else {
    candidatePath = pathResolve(importerDir, spec);
  }

  // Try candidate as-is, with extensions, and as index
  const tryExts = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py'];
  for (const ext of tryExts) {
    const p = candidatePath + ext;
    try {
      if (statSync(p).isFile()) return { kind: 'file', path: p };
    } catch {
      // not this one
    }
  }
  // Directory with index file or __init__.py
  try {
    if (statSync(candidatePath).isDirectory()) {
      for (const idx of ['index.js', 'index.ts', 'index.mjs', 'index.tsx', '__init__.py']) {
        const p = join(candidatePath, idx);
        try {
          if (statSync(p).isFile()) return { kind: 'dir-index', path: p };
        } catch {
          // continue
        }
      }
      return { kind: 'dir-no-index' };
    }
  } catch {
    // not a directory
  }

  // Does the candidate look like a real path that lives outside root? Bail
  if (!candidatePath.startsWith(root)) return { kind: 'skipped' };

  return { kind: 'missing', resolved: candidatePath };
}

async function analyze({ repo_url, branch = '' }) {
  const url = validateRepoUrl(repo_url);
  const ref = sanitizeRef(branch);
  const workDir = mkdtempSync(join(tmpdir(), 'dep-check-'));
  try {
    const cloneArgs = ['clone', '--depth', '1', '--no-tags'];
    if (ref) cloneArgs.push('-b', ref);
    cloneArgs.push(url, workDir);
    await run('git', cloneArgs, undefined, 90_000);

    const files = walkSourceFiles(workDir, MAX_FILES_SCAN);
    const dead = [];
    let scanned = 0;
    for (const file of files) {
      scanned++;
      let text;
      try {
        const s = statSync(file);
        if (s.size > MAX_FILE_BYTES) continue;
        text = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      const seen = new Set();
      for (const re of IMPORT_REGEXES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          const spec = m[1];
          if (!spec || seen.has(spec)) continue;
          seen.add(spec);
          const result = tryResolve(file, spec, workDir);
          if (result.kind === 'missing') {
            dead.push({
              file: relative(workDir, file),
              import: spec,
              resolved_to: relative(workDir, result.resolved),
            });
            if (dead.length >= 500) break;
          }
        }
        if (dead.length >= 500) break;
      }
      if (dead.length >= 500) break;
    }

    return {
      count: dead.length,
      dead_imports: dead,
      scanned_files: scanned,
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

// ---------- HTTP ----------

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/openapi.json') return sendJson(res, 200, spec);
    if (req.method === 'GET' && url.pathname === '/health')
      return sendJson(res, 200, { ok: true, service: 'dep-check' });

    if (req.method === 'POST' && url.pathname === '/analyze') {
      let body;
      try {
        body = await readBody(req);
      } catch {
        return sendJson(res, 400, { error: 'invalid json body' });
      }
      if (typeof body.repo_url !== 'string') {
        return sendJson(res, 400, { error: "missing required field 'repo_url'" });
      }
      try {
        const out = await analyze(body);
        return sendJson(res, 200, out);
      } catch (err) {
        return sendJson(res, 500, { error: 'analyze_failed', message: err.message });
      }
    }

    sendJson(res, 404, { error: 'not found', path: url.pathname });
  } catch (err) {
    console.error('[dep-check]', err);
    sendJson(res, 500, { error: 'internal error', message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[dep-check] listening on http://localhost:${PORT}`);
  console.log(`[dep-check] spec at  http://localhost:${PORT}/openapi.json`);
});
