// Renderer bundle serving route.
//
// GET /renderer/:slug/bundle.js        — the compiled ESM bundle
// GET /renderer/:slug/meta             — { slug, outputShape, bytes, sourceHash, compiledAt }
//
// The route is mounted in index.ts alongside the other Hono routers. Bundles
// live under DATA_DIR/renderers/<slug>.js (see services/renderer-bundler.ts).
//
// Auth: the renderer bundle is served behind the same global auth gate as
// the rest of the API (handled by globalAuthMiddleware in index.ts). The
// bundle is public-by-default because a creator who ships a renderer
// intends it to run in the user's browser; the bundle contains no secrets.

import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { getBundleResult } from '../services/renderer-bundler.js';

export const rendererRouter = new Hono();

rendererRouter.get('/:slug/meta', (c) => {
  const slug = c.req.param('slug');
  const bundle = getBundleResult(slug);
  if (!bundle) {
    return c.json(
      { error: 'not_found', code: 'renderer_not_found', details: { slug } },
      404,
    );
  }
  return c.json({
    slug: bundle.slug,
    output_shape: bundle.outputShape,
    bytes: bundle.bytes,
    source_hash: bundle.sourceHash,
    compiled_at: bundle.compiledAt,
  });
});

rendererRouter.get('/:slug/bundle.js', (c) => {
  const slug = c.req.param('slug');
  const bundle = getBundleResult(slug);
  if (!bundle) {
    return c.json(
      { error: 'not_found', code: 'renderer_not_found', details: { slug } },
      404,
    );
  }
  if (!existsSync(bundle.bundlePath)) {
    return c.json(
      { error: 'not_found', code: 'renderer_bundle_missing', details: { slug } },
      404,
    );
  }
  const body = readFileSync(bundle.bundlePath);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=60, must-revalidate',
      'x-floom-renderer-hash': bundle.sourceHash,
      'x-floom-renderer-shape': bundle.outputShape,
    },
  });
});
