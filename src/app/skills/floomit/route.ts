import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

// Serve the canonical floomit SKILL.md as plain text.
// This endpoint is designed to be fetched by agents that don't have local skill files.
// Cache: 5 min browser, 1 hr CDN (revalidated on each deploy via BUILD_ID).
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("raw");
  const accept = req.headers.get("accept") ?? "";
  const wantsHtml = !raw && (accept.includes("text/html") || accept.includes("*/*"));

  let content: string;
  try {
    const skillPath = path.join(process.cwd(), "skills", "floomit", "SKILL.md");
    content = readFileSync(skillPath, "utf8");
  } catch {
    return NextResponse.json({ error: "Skill file not found" }, { status: 404 });
  }

  const cacheHeaders = {
    "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=60",
  };

  if (wantsHtml) {
    // Minimal HTML wrapper for humans browsing the URL
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>floomit skill — Floom v0.4 canonical reference</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #222; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.875rem; }
    code { font-family: 'JetBrains Mono', monospace; }
    p { color: #555; font-size: 0.875rem; }
  </style>
</head>
<body>
  <p>Raw skill file — machine-readable. Append <code>?raw=1</code> for plain text.</p>
  <pre><code>${escaped}</code></pre>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", ...cacheHeaders },
    });
  }

  return new NextResponse(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...cacheHeaders },
  });
}
