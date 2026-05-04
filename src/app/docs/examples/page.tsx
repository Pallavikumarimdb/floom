"use client";

import Link from "next/link";
import { useState } from "react";

// ── Source data ──────────────────────────────────────────────────────────────

const MEETING_YAML = `name: Meeting Action Items
slug: meeting-action-items
command: python app.py
public: true
input_schema:
  type: object
  required: [transcript]
  additionalProperties: false
  properties:
    transcript:
      type: string
      format: textarea
      title: Meeting notes
      default: "Action: Sarah sends launch notes by Friday\\nMike owns beta checklist tomorrow"
    default_owner:
      type: string
      title: Default owner
      default: ""
output_schema:
  type: object
  required: [count, items, actions, summary]
  properties:
    count: { type: integer }
    items: { type: array, items: { type: object } }
    actions: { type: array, items: { type: object } }
    summary: { type: string }`;

const MEETING_PY = `"""Meeting -> Action Items.

Paste raw meeting notes, transcript, or chat log. Returns a structured list
of action items: who owns each task, when it's due. Plus a one-line summary.

Single Gemini 2.5 Flash Lite call via the REST API (urllib, stdlib only).
response_mime_type=application/json + responseSchema -> deterministic JSON.
"""

import json
import os
import urllib.request
import urllib.error

_GEMINI_MODEL = "gemini-2.5-flash-lite"
_GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{_GEMINI_MODEL}:generateContent"
)

_PROMPT = """Extract action items from these meeting notes.
For each action: identify the task, the owner (if named), and the due date
or timeframe (if mentioned). Use exactly the names that appear in the notes
for owner. If owner or due is not stated, use an empty string.
Also write a one-line summary of the meeting outcome.
Notes:
{notes}
"""

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string"},
                    "owner": {"type": "string"},
                    "due": {"type": "string"},
                },
                "required": ["task", "owner", "due"],
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["actions", "summary"],
}


def run(inputs):
    notes = str((inputs or {}).get("transcript") or "").strip()
    if len(notes) < 20:
        return {"error": "Too short — paste at least 20 characters.", "count": 0, "items": [], "actions": [], "summary": ""}

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GEMINI_BYOK")
    if not api_key:
        return {"error": "GEMINI_API_KEY is not configured for this app.", "count": 0, "items": [], "actions": [], "summary": ""}

    body = {
        "contents": [{"parts": [{"text": _PROMPT.format(notes=notes[:8000])}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
            "temperature": 0.1,
        },
    }
    req = urllib.request.Request(
        f"{_GEMINI_URL}?key={api_key}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    parts = payload["candidates"][0]["content"]["parts"]
    parsed = json.loads("".join(p.get("text", "") for p in parts))
    items = [{"task": a["task"], "owner": a.get("owner",""), "due": a.get("due","")} for a in parsed.get("actions",[])]
    return {"count": len(items), "items": items, "actions": items, "summary": parsed.get("summary","")}`;

const MEETING_INPUT_SCHEMA = `{
  "type": "object",
  "required": ["transcript"],
  "properties": {
    "transcript": {
      "type": "string",
      "format": "textarea",
      "title": "Meeting notes",
      "default": "Action: Sarah sends launch notes by Friday\\nMike owns beta checklist tomorrow"
    },
    "default_owner": {
      "type": "string",
      "title": "Default owner",
      "default": ""
    }
  },
  "additionalProperties": false
}`;

// ── Pitch Coach ──────────────────────────────────────────────────────────────

const PITCH_YAML = `name: Pitch Coach
slug: pitch-coach
description: Paste a startup pitch, get three direct critiques, three sharper rewrites, and a one-line TL;DR of the biggest issue.
command: python main.py
public: true
input_schema:
  type: object
  required: [pitch]
  additionalProperties: false
  properties:
    pitch:
      type: string
      format: textarea
      title: Pitch
      description: Paste a single pitch blurb. 20–500 characters.
      default: "We are a platform for AI apps that helps teams ship faster"
output_schema:
  type: object
  required: [harsh_truth, rewrites, one_line_tldr]
  properties:
    harsh_truth:
      type: array
      items:
        type: object
        properties:
          critique: { type: string }
          vc_reaction: { type: string }
    rewrites:
      type: array
      items:
        type: object
        properties:
          angle: { type: string }
          pitch: { type: string }
          when_to_use: { type: string }
    one_line_tldr: { type: string }
secrets:
  - name: GEMINI_API_KEY
    scope: shared
dependencies:
  python: ./requirements.txt`;

const PITCH_PY = `#!/usr/bin/env python3
"""Pitch Coach -- Floom demo app.

Floom injects inputs via FLOOM_INPUTS env var (JSON).
Print the result as JSON to stdout.
"""

import json, os
from google import genai
from google.genai import types

DEFAULT_MODEL = "gemini-2.5-flash-lite"

SYSTEM_PROMPT = """You are a brutally honest but fair startup pitch coach.
Give specific feedback, not generic advice. Focus on clarity, buyer, wedge,
credibility, and investor-readiness. Return only valid JSON."""

SCHEMA = {
    "type": "object",
    "required": ["harsh_truth", "rewrites", "one_line_tldr"],
    "properties": {
        "harsh_truth": {
            "type": "array", "minItems": 3, "maxItems": 3,
            "items": {"type": "object", "properties": {
                "critique": {"type": "string"},
                "vc_reaction": {"type": "string"}
            }, "required": ["critique", "vc_reaction"]}
        },
        "rewrites": {
            "type": "array", "minItems": 3, "maxItems": 3,
            "items": {"type": "object", "properties": {
                "angle": {"type": "string"},
                "pitch": {"type": "string"},
                "when_to_use": {"type": "string"}
            }, "required": ["angle", "pitch", "when_to_use"]}
        },
        "one_line_tldr": {"type": "string"}
    }
}

inputs = json.loads(os.environ.get("FLOOM_INPUTS", "{}"))
pitch = str(inputs.get("pitch") or "").strip()

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
resp = client.models.generate_content(
    model=DEFAULT_MODEL,
    contents=f"Critique this pitch:\\n\\n{pitch}",
    config=types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=SCHEMA,
    ),
)
print(json.dumps(json.loads(resp.text)))`;

const PITCH_REQUIREMENTS = `google-genai>=1.64.0,<2`;

// ── AI Readiness Audit ───────────────────────────────────────────────────────

const AUDIT_YAML = `name: AI Readiness Audit
slug: ai-readiness-audit
description: Paste one public HTTPS company URL, fetch the page, and return a strict AI-readiness score with 3 risks, 3 opportunities, and one concrete next step.
command: python main.py
public: true
input_schema:
  type: object
  required: [company_url]
  additionalProperties: false
  properties:
    company_url:
      type: string
      format: url
      title: Company URL
      default: "https://floom.dev"
output_schema:
  type: object
  required: [readiness_score, score_rationale, risks, opportunities, next_action]
  properties:
    readiness_score: { type: integer, minimum: 1, maximum: 10 }
    score_rationale: { type: string }
    risks:
      type: array
      items: { type: string }
    opportunities:
      type: array
      items: { type: string }
    next_action: { type: string }
secrets:
  - name: GEMINI_API_KEY
    scope: shared
dependencies:
  python: ./requirements.txt`;

const AUDIT_PY = `#!/usr/bin/env python3
"""AI Readiness Audit -- Floom demo app.

Floom injects inputs via FLOOM_INPUTS env var (JSON).
Print the result as JSON to stdout.
"""

import asyncio, json, os, re
import httpx
from bs4 import BeautifulSoup
from google import genai
from google.genai import types

DEFAULT_MODEL = "gemini-2.5-flash-lite"
FETCH_TIMEOUT = 5.0
MAX_BODY_BYTES = 500_000

SCHEMA = {
    "type": "object",
    "required": ["readiness_score", "score_rationale", "risks", "opportunities", "next_action"],
    "properties": {
        "readiness_score": {"type": "integer", "minimum": 1, "maximum": 10},
        "score_rationale": {"type": "string"},
        "risks": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
        "opportunities": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3},
        "next_action": {"type": "string"}
    }
}

async def fetch_page(url: str) -> str:
    async with httpx.AsyncClient(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": "FloomBot/1.0"})
        r.raise_for_status()
        soup = BeautifulSoup(r.content[:MAX_BODY_BYTES], "html.parser")
        for tag in soup(["script", "style", "nav", "footer"]):
            tag.decompose()
        return re.sub(r"\\s+", " ", soup.get_text(" ", strip=True))[:6000]

inputs = json.loads(os.environ.get("FLOOM_INPUTS", "{}"))
url = str(inputs.get("company_url") or "").strip()

page_text = asyncio.run(fetch_page(url))

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
resp = client.models.generate_content(
    model=DEFAULT_MODEL,
    contents=f"Score AI readiness for this company page:\\n\\n{page_text}",
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=SCHEMA,
    ),
)
print(json.dumps(json.loads(resp.text)))`;

const AUDIT_REQUIREMENTS = `beautifulsoup4==4.13.4
google-genai==1.64.0
httpx==0.28.1`;

// ── Multi-file Python ────────────────────────────────────────────────────────

const MULTI_YAML = `name: Multi-file Python
slug: multi-file-python
public: true
input_schema:
  type: object
  required: [text]
  additionalProperties: false
  properties:
    text: { type: string, title: Text to process }
output_schema:
  type: object
  required: [preview, length, word_count]
  properties:
    preview: { type: string }
    length: { type: integer }
    word_count: { type: integer }`;

const MULTI_APP_PY = `import json
import os
import sys

from utils import summarize


def main():
    raw = os.environ.get("FLOOM_INPUTS") or sys.stdin.read() or "{}"
    inputs = json.loads(raw)
    print(json.dumps(summarize(inputs)))


if __name__ == "__main__":
    main()`;

const MULTI_UTILS_PY = `from textwrap import shorten


def summarize(inputs):
    text = str(inputs.get("text") or "").strip()
    return {
        "preview": shorten(text, width=40, placeholder="..."),
        "length": len(text),
        "word_count": len([part for part in text.split() if part]),
    }`;

// ── App definitions ──────────────────────────────────────────────────────────

type Tab = { id: string; label: string; content: string };

type AppDef = {
  slug: string;
  name: string;
  desc: string;
  liveSlug?: string;
  tabs: Tab[];
  deployCmd: string;
};

const APPS: AppDef[] = [
  {
    slug: "meeting-action-items",
    name: "Meeting action items",
    desc: "Paste a meeting transcript; get back a list of action items and a summary. Uses Gemini.",
    liveSlug: "meeting-action-items",
    deployCmd: "npx @floomhq/cli@latest deploy",
    tabs: [
      { id: "yaml", label: "floom.yaml", content: MEETING_YAML },
      { id: "py", label: "app.py", content: MEETING_PY },
    ],
  },
  {
    slug: "pitch-coach",
    name: "Pitch coach",
    desc: "Paste a startup pitch; get three direct critiques, three sharper rewrites, and a one-line TL;DR of the biggest issue.",
    liveSlug: "pitch-coach",
    deployCmd: "npx @floomhq/cli@latest deploy",
    tabs: [
      { id: "yaml", label: "floom.yaml", content: PITCH_YAML },
      { id: "py", label: "main.py", content: PITCH_PY },
      { id: "req", label: "requirements.txt", content: PITCH_REQUIREMENTS },
    ],
  },
  {
    slug: "ai-readiness-audit",
    name: "AI readiness audit",
    desc: "Paste one public company URL; get an AI-readiness score with 3 risks, 3 opportunities, and one concrete next step.",
    liveSlug: "ai-readiness-audit",
    deployCmd: "npx @floomhq/cli@latest deploy",
    tabs: [
      { id: "yaml", label: "floom.yaml", content: AUDIT_YAML },
      { id: "py", label: "main.py", content: AUDIT_PY },
      { id: "req", label: "requirements.txt", content: AUDIT_REQUIREMENTS },
    ],
  },
  {
    slug: "multi-file-python",
    name: "Multi-file Python",
    desc: "Starter template: multi-file Python app with helpers, shared logic, and requirements.txt.",
    deployCmd: "npx @floomhq/cli@latest deploy",
    tabs: [
      { id: "yaml", label: "floom.yaml", content: MULTI_YAML },
      { id: "py", label: "app.py", content: MULTI_APP_PY },
      { id: "utils", label: "utils.py", content: MULTI_UTILS_PY },
    ],
  },
];

// ── Code block with copy ─────────────────────────────────────────────────────

function CodeBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="relative group">
      <pre className="max-w-full whitespace-pre-wrap break-words rounded-b-xl border-x border-b border-[#e0dbd0] bg-[#f5f4ed] p-4 text-xs leading-6 text-[#2a2520] font-mono overflow-x-auto">
        <code>{content}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity rounded border border-[#ddd8cc] bg-white px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-800 hover:border-neutral-400"
        aria-label="Copy code"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ── Tabbed source viewer ─────────────────────────────────────────────────────

function SourceTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className="mt-3">
      {/* Tab bar */}
      <div className="flex border-x border-t border-[#e0dbd0] rounded-t-xl overflow-hidden">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-3 py-2 text-xs font-mono font-medium transition-colors whitespace-nowrap ${
              active === tab.id
                ? "bg-[#f5f4ed] text-[#11110f] border-b-2 border-[#11110f]"
                : "bg-white text-neutral-500 hover:text-[#11110f] hover:bg-[#faf9f5] border-b border-[#e0dbd0]"
            } ${i > 0 ? "border-l border-[#e0dbd0]" : ""}`}
          >
            {tab.label}
          </button>
        ))}
        {/* fill remaining space */}
        <div className="flex-1 border-b border-[#e0dbd0] bg-white" />
      </div>
      <CodeBlock content={current.content} />
    </div>
  );
}

// ── Example card ─────────────────────────────────────────────────────────────

function ExampleCard({ app }: { app: AppDef }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[#ded8cc] bg-white overflow-hidden">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 flex-wrap p-5">
        <div className="min-w-0">
          <p className="font-semibold text-[#11110f]">{app.name}</p>
          <p className="mt-0.5 text-sm text-neutral-500">{app.desc}</p>
        </div>
        <div className="flex flex-shrink-0 gap-2 items-center">
          {app.liveSlug && (
            <Link
              href={`/p/${app.liveSlug}`}
              className="rounded-md border border-[#ded8cc] px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-neutral-400 transition-colors whitespace-nowrap"
            >
              Run app
            </Link>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              open
                ? "bg-[#11110f] text-white border-[#11110f]"
                : "border-[#ded8cc] text-neutral-700 hover:border-neutral-400"
            }`}
          >
            {open ? "Hide source" : "View source"}
          </button>
        </div>
      </div>

      {/* Source panel */}
      {open && (
        <div className="border-t border-[#ded8cc] px-5 pb-5">
          <SourceTabs tabs={app.tabs} />
          {/* Deploy command */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">
              Deploy
            </p>
            <div className="flex items-center gap-2 bg-[#f5f4ed] border border-[#e0dbd0] rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono text-[#2a2520]">{app.deployCmd}</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ExamplesPage() {
  return (
    <>
      <div className="mb-2">
        <p className="text-sm font-semibold text-emerald-700 mb-2">Reference</p>
        <h1 className="text-4xl font-black tracking-tight text-[#11110f]">
          Examples
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Working apps you can run now or use as a starting point. Each one shows the full source — manifest, handler code, and any dependencies.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {APPS.map((app) => (
          <ExampleCard key={app.slug} app={app} />
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-[#ded8cc] bg-[#faf9f5] p-5">
        <p className="text-sm font-semibold text-[#11110f] mb-1">Start from a template</p>
        <p className="text-sm text-neutral-500 mb-3">
          The CLI <code className="rounded px-1.5 py-0.5 bg-[#f0ede6] border border-[#e0dbd0] text-[0.85em] font-mono text-[#2a2520]">init</code> command scaffolds any of these.
        </p>
        <div className="bg-[#f5f4ed] border border-[#e0dbd0] rounded-lg px-3 py-2">
          <code className="text-xs font-mono text-[#2a2520]">
            npx @floomhq/cli@latest init --template meeting-action-items
          </code>
        </div>
      </div>
    </>
  );
}
