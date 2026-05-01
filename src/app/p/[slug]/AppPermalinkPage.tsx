'use client';
// v5 port of floom@main/pages/AppPermalinkPage.tsx (2196 lines)
// Mechanical changes only:
//   - react-router-dom → next/link + next/navigation
//   - <Link to={x}> → <Link href={x}>
//   - useParams/useSearchParams from next/navigation
//   - setSearchParams → router.replace() with URLSearchParams
//   - getApp/getRun/shareRun → direct fetch() calls
//   - getAppReviews → stub returning empty summary
//   - TopBar → SiteHeader, Footer → FloomFooter
//   - All heavy components → stubs with // TODO(v5-port): comments
// See docs/v5-port-stubs.md for full stub list.

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { FloomFooter } from '@/components/FloomFooter';
import { RunSurface, PastRunsDisclosure, type RunSurfaceResult } from '@/components/runner/RunSurface';
import { AppIcon } from '@/components/AppIcon';
import { AppReviews } from '@/components/AppReviews';
import { FeedbackButton } from '@/components/FeedbackButton';
import { DescriptionMarkdown } from '@/components/DescriptionMarkdown';
import { Confetti } from '@/components/Confetti';
import { ShareModal } from '@/components/share/ShareModal';
import { SkillModal } from '@/components/share/SkillModal';
import { InstallPopover } from '@/components/share/InstallPopover';
import { Download as DownloadIcon } from 'lucide-react';
import { ApiError } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import type { ActionSpec, AppDetail, ReviewSummary, RunRecord } from '@/lib/types';
import {
  buildPublicRunPath,
  classifyPermalinkLoadError,
  getPermalinkLoadErrorMessage,
  type PermalinkLoadOutcome,
} from '@/lib/publicPermalinks';
import {
  consumeJustPublished,
  hasConfettiShown,
  markConfettiShown,
  samplePrefill,
} from '@/lib/onboarding';
import { getLaunchDemoExampleTextInputs } from '@/lib/app-examples';
import { createClient } from '@/lib/supabase/client';

// Map of known app slugs to GitHub repo URLs.
const GITHUB_REPOS: Record<string, string> = {
  'blast-radius': 'https://github.com/floomhq/floom/tree/main/examples/blast-radius',
  'claude-wrapped': 'https://github.com/floomhq/floom/tree/main/examples/claude-wrapped',
  'dep-check': 'https://github.com/floomhq/floom/tree/main/examples/dep-check',
  'hook-stats': 'https://github.com/floomhq/floom/tree/main/examples/hook-stats',
  'session-recall': 'https://github.com/floomhq/floom/tree/main/examples/session-recall',
  'ig-nano-scout': 'https://github.com/floomhq/floom/tree/main/examples/ig-nano-scout',
};

// R37 (2026-04-29): empty set — all slugs are runnable.
const DOCKER_RUNTIME_COMING_SOON_SLUGS = new Set<string>([]);

// v23 PR-D: per-slug hero subhead for the 3 launch demos.
const HERO_SUBHEAD: Record<string, string> = {
  'competitor-lens':
    'Paste 2 URLs (yours + competitor). Get the positioning, pricing, and angle diff in under 5 seconds.',
  'ai-readiness-audit':
    'Paste a company URL. Get a readiness score, 3 risks, 3 opportunities, and one concrete next step.',
  'pitch-coach':
    'Paste a 20-500 char startup pitch. Get 3 direct critiques, 3 rewrites by angle, and a one-line TL;DR.',
  'meeting-action-items':
    'Paste meeting notes. Get action items with owners and due dates.',
};

export default function AppPermalinkPage() { // exported as default so the server page can dynamic-import without renaming
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const searchParams = useSearchParams();
  const router = useRouter();

  const runIdFromUrl = searchParams?.get('run') ?? null;
  const rerunIdFromUrl = searchParams?.get('rerun') ?? null;
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  const [app, setApp] = useState<AppDetail | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadFailure, setLoadFailure] = useState<PermalinkLoadOutcome | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalUrl, setShareModalUrl] = useState<string>('');
  const [claudeSkillModalOpen, setClaudeSkillModalOpen] = useState(false);
  const [installPopoverOpen, setInstallPopoverOpen] = useState(false);

  type PTab = 'run' | 'about' | 'install' | 'source' | 'runs';
  const initialTab = (searchParams?.get('tab') as PTab | null) ?? 'run';
  const [activeTab, setActiveTab] = useState<PTab>(
    ['run', 'about', 'install', 'source', 'runs'].includes(initialTab) ? initialTab : 'run',
  );

  const [initialRun, setInitialRun] = useState<RunRecord | null>(null);
  const [initialRunLoading, setInitialRunLoading] = useState<boolean>(!!runIdFromUrl);
  const [rerunInputs, setRerunInputs] = useState<Record<string, unknown> | null>(null);
  const [rerunLoading, setRerunLoading] = useState<boolean>(!!rerunIdFromUrl && !runIdFromUrl);
  const [runNotFound, setRunNotFound] = useState(false);

  const [confettiFire, setConfettiFire] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Helper to update URL search params without full navigation.
  const updateSearchParams = useCallback(
    (updater: (prev: URLSearchParams) => URLSearchParams) => {
      const url = new URL(window.location.href);
      const next = updater(new URLSearchParams(url.search));
      url.search = next.toString();
      router.replace(url.pathname + url.search, { scroll: false } as Parameters<typeof router.replace>[1]);
    },
    [router],
  );

  const openShareModal = useCallback(() => {
    const resolve = async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const currentRunId = currentUrl.searchParams.get('run');
        if (!currentRunId) {
          setShareModalUrl(currentUrl.toString());
          setShareModalOpen(true);
          return;
        }
        try {
          // TODO(v5-port): shareRun() stub — just expose current URL as share URL
          setShareModalUrl(
            `${window.location.origin}${buildPublicRunPath(currentRunId)}`,
          );
        } catch {
          currentUrl.searchParams.delete('run');
          setShareModalUrl(currentUrl.toString());
        }
        setShareModalOpen(true);
      } catch {
        setShareModalUrl(window.location.href);
        setShareModalOpen(true);
      }
    };
    void resolve();
  }, []);

  // Fetches app metadata when slug is available. The synchronous setState
  // calls in the !slug guard are deliberate early-exit resets (not cascading
  // renders) that clear stale state before the async fetch path runs.
  useEffect(() => {
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotFound(true);
      setLoadFailure(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    setLoadFailure(null);
    const loadApp = async () => {
      const headers: Record<string, string> = {};
      try {
        const { data } = await createClient().auth.getSession();
        if (data.session?.access_token) {
          headers.Authorization = `Bearer ${data.session.access_token}`;
        }
      } catch {
        // Public app metadata still loads without a browser session.
      }

      // Data seam: getApp(slug) → fetch('/api/apps/' + slug)
      const res = await fetch(`/api/apps/${slug}`, { headers });
      if (!res.ok) {
        const err = new ApiError('App not found', res.status);
        const outcome = classifyPermalinkLoadError(err);
        setNotFound(outcome === 'not_found');
        setLoadFailure(outcome === 'retryable' ? outcome : null);
        setLoading(false);
        return;
      }
      const a = await res.json() as AppDetail & {
        handler?: string;
        input_schema?: unknown;
        output_schema?: unknown;
      };
      return a;
    };

    loadApp()
      .then(async (res) => {
        if (!res) return;
        const a = res;
        // Synthesize manifest from the floom-minimal API shape:
        // /api/apps/[slug] returns { id, slug, name, runtime, entrypoint,
        // handler, input_schema, output_schema, public }. The v5-ported
        // page expects floom.dev's shape with manifest.actions[<key>] +
        // manifest.primary_action. Without this normalization, page
        // crashes because Object.keys(app.manifest.actions)[0] hits
        // undefined deeper in the render tree.
        if (!a.manifest) {
          const handlerKey = a.handler ?? 'run';
          // Convert input_schema.properties → manifest.actions[].inputs.
          // Required for samplePrefillInputs lookup, claudeSkillFirstInput,
          // and any v5 chrome that iterates over action.inputs.
          const schema = (a.input_schema ?? null) as
            | { properties?: Record<string, { type?: string; title?: string; description?: string }>; required?: ReadonlyArray<string> }
            | null;
          const inputs = schema?.properties
            ? Object.entries(schema.properties).map(([name, prop]) => ({
                name,
                type: prop.type ?? 'string',
              }))
            : [];
          (a as AppDetail & { manifest: AppDetail['manifest'] }).manifest = {
            name: a.name,
            actions: {
              [handlerKey]: {
                label: a.name,
                description: a.description ?? '',
                inputs,
              },
            },
            primary_action: handlerKey,
            secrets_needed: [],
            capabilities: {},
          };
        }
        // Description fallback so AboutTab isn't empty. The About tab checks
        // for description-equals-header-tagline and hides itself, so this
        // needs to be richer than the header line.
        if (!a.description) {
          a.description =
            `**${a.name}** is a Python function-style app running on Floom's E2B sandbox. ` +
            `Each run is hosted on Floom — no per-app deploy. The same handler is exposed as a web UI here, ` +
            `as a REST endpoint at \`POST /api/apps/${a.slug}/run\`, and as an MCP tool at \`/mcp\`.`;
        }
        // version + author fallbacks the v5 chrome reads.
        if (!a.version) (a as AppDetail).version = '0.1.0';
        if (!a.author_display) (a as AppDetail).author_display = '@floom';
        setApp(a);
        setLoading(false);
      })
      .catch((err) => {
        const outcome = classifyPermalinkLoadError(err);
        setNotFound(outcome === 'not_found');
        setLoadFailure(outcome === 'retryable' ? outcome : null);
        setLoading(false);
      });
    // Data seam: getAppReviews(slug) → return empty summary
    setSummary({ count: 0, avg: 0 });
  }, [slug]);

  // /p/:slug?run=<id> — fetch the run and hydrate RunSurface read-only.
  // The synchronous reset in the guard branch clears stale run state when
  // the URL no longer has a ?run= param — intentional early-exit reset.
  useEffect(() => {
    if (!slug || !runIdFromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitialRun(null);
      setInitialRunLoading(false);
      setRunNotFound(false);
      return;
    }
    let cancelled = false;
    setInitialRunLoading(true);
    setRunNotFound(false);
    // Data seam: getRun(runIdFromUrl) → fetch('/api/runs/' + runIdFromUrl)
    fetch(`/api/runs/${runIdFromUrl}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new ApiError('Run not found', 404);
          throw new ApiError('Run unavailable', res.status);
        }
        return res.json() as Promise<RunRecord>;
      })
      .then((run) => {
        if (cancelled) return;
        if (run.app_slug && run.app_slug !== slug) {
          setInitialRun(null);
          updateSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('run');
            return next;
          });
          return;
        }
        if (['success', 'error', 'timeout'].includes(run.status)) {
          setInitialRun(run);
        } else {
          setInitialRun(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setInitialRun(null);
        if (err instanceof ApiError && err.status === 404) {
          setRunNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setInitialRunLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, runIdFromUrl, updateSearchParams]);

  // /p/:slug?rerun=<id> — fetch the original run's inputs to pre-fill the form.
  // The synchronous resets in the guard clear stale state when URL conditions
  // are not met — intentional early-exit resets, not cascading renders.
  useEffect(() => {
    if (!slug || !rerunIdFromUrl || runIdFromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRerunInputs(null);
      setRerunLoading(false);
      return;
    }
    let cancelled = false;
    setRerunLoading(true);
    // Data seam: getRun(rerunIdFromUrl) → fetch('/api/runs/' + rerunIdFromUrl)
    fetch(`/api/runs/${rerunIdFromUrl}`)
      .then(async (res) => {
        if (!res.ok) throw new ApiError('Run not found', res.status);
        return res.json() as Promise<RunRecord>;
      })
      .then((run) => {
        if (cancelled) return;
        if (run.app_slug && run.app_slug !== slug) {
          setRerunInputs(null);
          updateSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('rerun');
            return next;
          });
          return;
        }
        if (run.inputs && typeof run.inputs === 'object' && !Array.isArray(run.inputs)) {
          setRerunInputs(run.inputs as Record<string, unknown>);
          return;
        }
        setRerunInputs({});
      })
      .catch(() => {
        if (!cancelled) setRerunInputs(null);
      })
      .finally(() => {
        if (!cancelled) setRerunLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, rerunIdFromUrl, runIdFromUrl, updateSearchParams]);

  const handleResetInitialRun = useCallback(() => {
    setInitialRun(null);
    setRunNotFound(false);
    updateSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('run');
      return next;
    });
  }, [updateSearchParams]);

  const runSurfaceRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (activeTab !== 'run') return;
    if (runIdFromUrl || initialRun || initialRunLoading || rerunLoading) return;
    if (!app) return;
    const raf = requestAnimationFrame(() => {
      const root = runSurfaceRef.current;
      if (!root) return;
      const target = root.querySelector<HTMLElement>(
        'input.input-field, textarea.input-field, select.input-field',
      );
      if (target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [app, activeTab, runIdFromUrl, initialRun, initialRunLoading, rerunLoading]);

  const initialSurfaceLoading = initialRunLoading || rerunLoading;

  const headerDescription = useMemo<string>(() => {
    if (app?.slug && HERO_SUBHEAD[app.slug]) return HERO_SUBHEAD[app.slug];
    if (!app?.description) return '';
    return app.description
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/(\*\*|__|\*|_)/g, '')
      .replace(/^\s*(#+|[-*+]|\d+\.)\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  // Use `app` as the dep so the React Compiler can unambiguously track
  // app.description and app.slug without optional-chaining mismatches.
  }, [app]);

  const samplePrefillInputs = useMemo<Record<string, unknown> | null>(() => {
    if (!app) return null;
    if (runIdFromUrl || rerunIdFromUrl) return null;
    const firstActionKey = Object.keys(app.manifest.actions)[0];
    const action = firstActionKey ? app.manifest.actions[firstActionKey] : undefined;
    if (!action || action.inputs.length === 0) return null;
    const demoText = getLaunchDemoExampleTextInputs(app.slug);
    if (demoText) {
      const prefilled: Record<string, unknown> = {};
      for (const spec of action.inputs) {
        if (spec.name in demoText) {
          prefilled[spec.name] = demoText[spec.name];
        }
      }
      if (Object.keys(prefilled).length > 0) return prefilled;
    }
    const first = action.inputs[0];
    const sample = samplePrefill(first);
    if (sample == null) return null;
    return { [first.name]: sample };
  }, [app, runIdFromUrl, rerunIdFromUrl]);

  const claudeSkillFirstInput = useMemo<string | null>(() => {
    if (!app) return null;
    const actions = app.manifest?.actions ?? {};
    const primary =
      app.manifest?.primary_action && actions[app.manifest.primary_action]
        ? app.manifest.primary_action
        : Object.keys(actions)[0];
    if (!primary) return null;
    const action = actions[primary];
    const first = action?.inputs?.[0];
    return first?.name ?? null;
  }, [app]);

  // Fire confetti once when the user lands on a freshly-published app. The
  // setState calls here are one-time celebratory UI triggers driven by a
  // localStorage flag — not a data-fetch or cascading update loop.
  useEffect(() => {
    if (!app?.slug) return;
    if (!consumeJustPublished(app.slug)) return;
    if (!hasConfettiShown(app.slug)) {
      markConfettiShown(app.slug);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfettiFire(true);
    }
    setCelebrate(true);
  }, [app?.slug]);

  const handleRunResult = useCallback(
    (_result: RunSurfaceResult) => {
      if (!app) return;
    },
    [app],
  );

  useEffect(() => {
    if (!app) return;
    const docTitle = `${app.name} · Floom`;
    document.title = docTitle;
    const setMeta = (name: string, content: string, prop = false) => {
      const attr = prop ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('description', app.description);
    setMeta('og:title', docTitle, true);
    setMeta('og:description', app.description, true);
    setMeta('og:url', `${window.location.origin}/p/${app.slug}`, true);
    setMeta('og:type', 'website', true);
    const canon = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canon) canon.setAttribute('href', `${window.location.origin}/p/${app.slug}`);
    setMeta('og:image', `${window.location.origin}/og/${app.slug}.svg`, true);
    setMeta('twitter:image', `${window.location.origin}/og/${app.slug}.svg`);
    setMeta('twitter:title', docTitle);
    setMeta('twitter:description', app.description);

    const existing = document.getElementById('jsonld-app');
    if (existing) existing.remove();
    const script = document.createElement('script');
    script.id = 'jsonld-app';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: app.name,
      description: app.description,
      applicationCategory: app.category || 'UtilitiesApplication',
      url: `${window.location.origin}/p/${app.slug}`,
      author: {
        '@type': 'Person',
        name: app.author_display || app.author || 'floomhq',
      },
    });
    document.head.appendChild(script);

    return () => {
      document.title = 'Floom: production layer for AI apps';
      const s = document.getElementById('jsonld-app');
      if (s) s.remove();
    };
  }, [app]);

  const HOW_IT_WORKS_MAX = 6;
  const howItWorks = useMemo<Array<{ label: string; description?: string }>>(() => {
    if (!app) return [];
    const entries = Object.entries(app.manifest?.actions ?? {}) as Array<[string, ActionSpec]>;
    if (entries.length > 0) {
      return entries.slice(0, HOW_IT_WORKS_MAX).map(([, spec]) => ({
        label: spec.label,
        description: spec.description,
      }));
    }
    return (app.actions || []).slice(0, HOW_IT_WORKS_MAX).map((name) => ({ label: name }));
  }, [app]);

  const createdByLabel = useMemo(() => {
    if (!app) return null;
    if (app.author_display && app.author_display.trim()) return app.author_display.trim();
    if (app.author) {
      const a = app.author;
      return a.length > 22 ? `@${a.slice(0, 20)}…` : `@${a}`;
    }
    return null;
  }, [app]);

  const _heroHandle = useMemo(() => {
    if (!app) return null;
    const raw =
      (app.creator_handle && app.creator_handle.trim()) ||
      (app.author_display && app.author_display.replace(/^@/, '').trim()) ||
      (app.author && app.author.trim()) ||
      null;
    if (!raw) return null;
    return raw.length > 22 ? `${raw.slice(0, 20)}…` : raw;
  }, [app]);
  void _heroHandle;

  const capabilityChips = useMemo(() => {
    if (!app) return [] as Array<{ key: string; label: string; mono?: boolean }>;
    const out: Array<{ key: string; label: string; mono?: boolean }> = [];
    const seen = new Set<string>();
    const add = (key: string, label: string, opts?: { mono?: boolean }) => {
      const t = label.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push({ key, label: t, mono: opts?.mono });
    };
    const titleCaseWords = (s: string) =>
      s
        .replace(/[_-]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    const m = app.manifest as unknown as Record<string, unknown>;
    const caps = m?.capabilities;
    if (caps && typeof caps === 'object' && !Array.isArray(caps)) {
      for (const [k, v] of Object.entries(caps as Record<string, unknown>)) {
        if (v === true) {
          if (k === 'web_search' || k === 'network' || k === 'web') {
            add(`cap-${k}`, 'Web search');
          } else {
            add(`cap-${k}`, titleCaseWords(k));
          }
        } else if (typeof v === 'string' && v.trim()) {
          add(`cap-${k}`, `${titleCaseWords(k)}: ${v.trim()}`);
        } else if (typeof v === 'number' && v !== 0) {
          add(`cap-${k}`, `${titleCaseWords(k)}: ${v}`);
        }
      }
    }
    const rt = (app.runtime && app.runtime.trim()) || (typeof m.runtime === 'string' ? m.runtime.trim() : '');
    if (rt) {
      add('runtime', `Runtime: ${rt}`);
    }
    for (const s of app.manifest.secrets_needed ?? []) {
      if (typeof s === 'string' && s.trim()) {
        add(`sec-${s}`, s.trim(), { mono: true });
      }
    }
    if (app.is_async) add('async', 'Async jobs');
    if (app.upstream_host?.trim()) {
      add('upstream', `API: ${app.upstream_host.trim()}`);
    }
    if (app.renderer) add('custom-renderer', 'Custom output UI');
    return out;
  }, [app]);

  if (loading) {
    return (
      <div className="page-root">
        <SiteHeader />
        <main
          style={{ padding: '20px 24px 80px', width: '100%', maxWidth: 1320, margin: '0 auto' }}
          data-testid="permalink-page"
          aria-busy="true"
        >
          {/* Breadcrumb placeholder */}
          <div style={{ height: 18, marginBottom: 14, width: 180, background: 'var(--line)', opacity: 0.25, borderRadius: 4 }} />

          {/* Frame card */}
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(22,21,18,.04), 0 4px 20px rgba(22,21,18,.06)',
            }}
          >
            {/* Compact app-header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '18px 24px 16px',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: 18, width: '40%', borderRadius: 4, background: 'var(--line)', opacity: 0.35, marginBottom: 6 }} />
                <div style={{ height: 12, width: '70%', borderRadius: 4, background: 'var(--line)', opacity: 0.22 }} />
              </div>
              <div style={{ height: 32, width: 120, borderRadius: 8, background: 'var(--line)', opacity: 0.2 }} />
            </div>

            {/* Body */}
            <div style={{ padding: '24px', minHeight: 360, background: 'var(--card)' }}>
              <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
                Loading...
              </p>
            </div>

            {/* Chip row */}
            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '14px 24px',
                borderTop: '1px solid var(--line)',
                background: 'var(--card)',
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{ height: 28, width: 110, borderRadius: 999, background: 'var(--line)', opacity: 0.22 }}
                />
              ))}
            </div>
          </div>
        </main>
        <FloomFooter />
      </div>
    );
  }

  if (notFound || !app) {
    const retryable = loadFailure === 'retryable';
    return (
      <div className="page-root">
        <SiteHeader />
        <main className="main" style={{ paddingTop: 80, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 12px' }}>
            {retryable ? 'App temporarily unavailable' : '404'}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 16, margin: '0 0 32px' }}>
            {retryable ? (
              getPermalinkLoadErrorMessage('app')
            ) : (
              <>
                No app found at{' '}
                <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>/p/{slug}</code>
              </>
            )}
          </p>
          <div style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
            {retryable ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 20px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: '1px solid var(--accent)',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Try again
              </button>
            ) : null}
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                background: retryable ? 'var(--card)' : 'var(--accent)',
                color: retryable ? 'var(--ink)' : '#fff',
                borderRadius: 8,
                border: retryable ? '1px solid var(--line)' : '1px solid var(--accent)',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Back home
            </Link>
          </div>
        </main>
        <FloomFooter />
      </div>
    );
  }

  if (DOCKER_RUNTIME_COMING_SOON_SLUGS.has(app.slug)) {
    return (
      <div className="page-root">
        <SiteHeader />
        <main style={{ paddingTop: 80, textAlign: 'center', maxWidth: 480, margin: '0 auto', padding: '80px 24px 80px' }}>
          <AppIcon slug={app.slug} size={56} />
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '20px 0 10px', color: 'var(--ink)' }}>
            {app.name}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, margin: '0 0 28px', lineHeight: 1.6 }}>
            {HERO_SUBHEAD[app.slug] ?? app.description}
          </p>
          <div
            style={{
              display: 'inline-block',
              background: '#fff5e8',
              border: '1px solid #f5cf90',
              borderRadius: 10,
              padding: '14px 18px',
              fontSize: 13.5,
              color: '#7c5400',
              lineHeight: 1.55,
              textAlign: 'left',
              maxWidth: 380,
            }}
          >
            <strong>Launching with Floom v1.0.</strong> This app runs inside an isolated container and will be
            available once sandbox hardening ships. Check back soon.
          </div>
          <div style={{ marginTop: 24 }}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 8,
                border: '1px solid var(--accent)',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Browse live apps
            </Link>
          </div>
        </main>
        <FloomFooter />
      </div>
    );
  }

  // floom-minimal serves a single MCP endpoint at /mcp; per-app routing is handled internally.
  const mcpEndpoint = `${typeof window !== 'undefined' ? window.location.origin : ''}/mcp`;
  const githubRepo = GITHUB_REPOS[app.slug];
  const topBarCompact = Boolean(runIdFromUrl || initialRun);
  void topBarCompact; // SiteHeader doesn't have compact prop yet — TODO(v5-port)

  return (
    <div className="page-root">
      <SiteHeader />

      <Confetti fire={confettiFire} onDone={() => setConfettiFire(false)} />

      <main
        id="main"
        style={{ padding: '14px 24px 64px', width: '100%', maxWidth: 1320, margin: '0 auto' }}
        data-testid="permalink-page"
      >
        {/* v17 breadcrumb: quiet Apps / app-name. Lives OUTSIDE the frame card. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
            fontSize: 12.5,
            color: 'var(--muted)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
              Apps
            </Link>
            <span aria-hidden="true" style={{ color: 'var(--line)' }}>/</span>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{app.name}</span>
          </div>
          {app.author && sessionUserId && app.author === sessionUserId && (
            <Link
              href={`/studio/${app.slug}`}
              data-testid="open-in-studio"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--muted)',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              Open in Studio <ArrowRight />
            </Link>
          )}
        </div>

        {/* R10 (2026-04-28): outer wrapper card REMOVED. Hero + tabs sit directly on cream bg. */}
        <div
          data-testid="permalink-card"
          style={{
            background: 'transparent',
          }}
        >

          {/* F2 / R10.1: compact hero row */}
          <section
            data-testid="permalink-hero"
            className="permalink-hero-row"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '4px 0 12px',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <AppIcon slug={app.slug} size={22} />
            </div>
            <div className="permalink-hero-title" style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  margin: 0,
                  lineHeight: 1.18,
                  letterSpacing: '-0.02em',
                }}
              >
                {app.name}
              </h1>
              {headerDescription && (
                <p
                  data-testid="hero-description"
                  title={headerDescription}
                  style={{
                    fontSize: 13.5,
                    color: 'var(--muted)',
                    margin: '4px 0 0',
                    lineHeight: 1.45,
                    maxWidth: 640,
                  }}
                >
                  {headerDescription}
                </p>
              )}
              {/* G5 / R7 U2: unified single-row pills (wrap allowed) */}
              <div
                data-testid="hero-version-meta"
                className="permalink-hero-version-meta"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                  marginTop: 10,
                }}
              >
                {app.runs_7d != null && app.runs_7d > 0 && (
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--bg)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {app.runs_7d.toLocaleString()} runs · 7d
                  </span>
                )}
                {app.category && (
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--bg)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {app.category}
                  </span>
                )}
                {summary && summary.count > 0 && (
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--bg)', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <StarsRow value={summary.avg} size={11} />
                    {summary.avg.toFixed(1)}
                  </span>
                )}
                {/* R16 (2026-04-28): dropped "· stable" qualifier. Just the version number. */}
                <span data-testid="hero-version" style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--muted)', background: 'var(--bg)', fontFamily: 'JetBrains Mono, ui-monospace, monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  v{app.version ?? '0.1.0'}
                </span>
                {/* G5: capability chips merged inline */}
                {capabilityChips.map((c) => (
                  <span
                    key={c.key}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 9px',
                      borderRadius: 999,
                      border: '1px solid var(--line)',
                      color: 'var(--muted)',
                      background: c.mono ? 'var(--studio, #f5f4f0)' : 'var(--bg)',
                      letterSpacing: c.mono ? 0 : '0.02em',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      fontFamily: c.mono
                        ? "'JetBrains Mono', ui-monospace, monospace"
                        : undefined,
                    }}
                  >
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
            <div
              className="permalink-hero-actions"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
                flexWrap: 'wrap',
              }}
            >
              {/* R7.6 (2026-04-28): unified Install button */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  data-testid="cta-install"
                  aria-label="Install"
                  aria-haspopup="dialog"
                  aria-expanded={installPopoverOpen}
                  onClick={() => setInstallPopoverOpen((o) => !o)}
                  style={{
                    padding: '8px 14px',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    background: 'var(--card)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <DownloadIcon size={14} aria-hidden="true" /> Install
                </button>
                {app && (
                  <InstallPopover
                    open={installPopoverOpen}
                    onClose={() => setInstallPopoverOpen(false)}
                    slug={app.slug}
                    appName={app.name}
                    isAuthenticated={!!session && session.user?.is_local !== true}
                    hasToken={false}
                    firstInputName={claudeSkillFirstInput}
                  />
                )}
              </div>
              <button
                type="button"
                data-testid="cta-share"
                aria-label="Share link"
                onClick={openShareModal}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  background: 'var(--card)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <ShareIcon /> Share
              </button>
            </div>
          </section>

          {/* Tab bar v11: sliding underline animation */}
          <TabBar
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              updateSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                if (tab === 'run') next.delete('tab');
                else next.set('tab', tab);
                return next;
              });
            }}
          />

          {/* Frame body: swappable by ?tab= */}
          <div
            className="app-page-body"
            style={{
              padding: '24px 0 36px',
              background: 'transparent',
            }}
          >

        {/* Run tab (DEFAULT) */}
        {activeTab === 'run' && (
          <section
            id="run"
            ref={runSurfaceRef}
            data-testid="tab-content-run-primary"
            data-surface="run"
            className="run-surface"
            style={{
              minHeight: 320,
            }}
          >
            {initialSurfaceLoading ? (
              <div
                data-testid="shared-run-loading"
                style={{ color: 'var(--muted)', fontSize: 13, padding: 24, textAlign: 'center' }}
              >
                {runIdFromUrl ? 'Loading shared run...' : 'Loading previous inputs...'}
              </div>
            ) : (
              <>
                {/* 2026-04-20 (P2 #147): "Run not found" card for dead run-ids */}
                {runNotFound && (
                  <div
                    data-testid="shared-run-not-found"
                    role="status"
                    style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: 12,
                      padding: '16px 20px',
                      marginBottom: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                        This run isn&apos;t available
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                        The link may have expired or the run was deleted. You
                        can still run {app.name} with fresh inputs below.
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="shared-run-not-found-reset"
                      onClick={handleResetInitialRun}
                      style={{
                        padding: '8px 14px',
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--ink)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Try this app →
                    </button>
                  </div>
                )}
                <RunSurface
                  app={app}
                  initialRun={initialRun}
                  initialInputs={rerunInputs ?? undefined}
                  examplePrefillInputs={samplePrefillInputs ?? undefined}
                  onResetInitialRun={handleResetInitialRun}
                  onResult={handleRunResult}
                  onShare={openShareModal}
                />
                {/* v11: privacy note — tighter, info-icon style */}
                <div
                  data-testid="ap-privacy-note"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 16,
                    fontSize: 12,
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ flexShrink: 0, opacity: 0.5 }}
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>
                    Inputs are sent to {app.manifest?.name ?? app.name}{' '}to produce a result. Floom doesn&apos;t sell or share run data.
                  </span>
                </div>
                {/* v11: Built with Floom credit */}
                <div
                  style={{
                    marginTop: 24,
                    paddingTop: 20,
                    borderTop: '1px solid var(--line)',
                    fontSize: 12,
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <img src="/floom-mark-glow.svg" alt="" aria-hidden="true" width={14} height={14} style={{ opacity: 0.55 }} />
                  Built with{' '}
                  <Link
                    href="/"
                    style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Floom
                  </Link>
                  {' '}— localhost to live in 60 seconds.
                </div>
                {celebrate && (
                  <CelebrationCard
                    slug={app.slug}
                    copied={shareCopied}
                    onCopy={() => {
                      try {
                        navigator.clipboard.writeText(window.location.href);
                        setShareCopied(true);
                        window.setTimeout(() => setShareCopied(false), 1800);
                      } catch {
                        /* clipboard blocked */
                      }
                    }}
                    onDismiss={() => setCelebrate(false)}
                  />
                )}
              </>
            )}
          </section>
        )}

        {/* About tab. v26 parity: two-column layout */}
        {activeTab === 'about' && (
        <>
        <div
          data-testid="about-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 280px',
            gap: 32,
          }}
          className="about-body-grid"
        >
          {/* Left: prose + how-it-works + reviews */}
          <main>
            {/* How it works strip */}
            {howItWorks.length > 0 && (
              <section
                data-testid="how-it-works"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                {howItWorks.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Step {idx + 1}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{step.label}</div>
                    {step.description && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>{step.description}</div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {/* About prose */}
            {(() => {
              const trimmed = (app.description ?? '').trim();
              const isDuplicateOfHero =
                trimmed.length > 0 &&
                trimmed === headerDescription &&
                trimmed.length <= 160;
              const showAboutProse = !!trimmed && !isDuplicateOfHero;
              const hasReviews = summary && summary.count > 0;
              if (!showAboutProse && !hasReviews) {
                return (
                  <section style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--line)' }}>
                    <AppReviews slug={app.slug} />
                  </section>
                );
              }
              return (
                <section style={{ paddingBottom: 24, marginBottom: 24, borderBottom: '1px solid var(--line)' }}>
                  {showAboutProse && (
                    <>
                      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 14px', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                        About this app
                      </h2>
                      <DescriptionMarkdown
                        description={app.description!}
                        testId="about-description"
                        style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.65, marginBottom: 24 }}
                      />
                    </>
                  )}
                  {hasReviews && <RatingsWidget summary={summary} />}
                  <AppReviews slug={app.slug} />
                </section>
              );
            })()}
          </main>

          {/* Right: aside meta panels */}
          <aside data-testid="about-aside">
            {/* App meta panel */}
            <div
              data-testid="details-card"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '16px 18px',
                marginBottom: 14,
              }}
            >
              <h4 style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 10px' }}>
                App meta
              </h4>
              <AboutMetaRow label="Slug" value={<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>{app.slug}</code>} />
              {app.version && <AboutMetaRow label="Version" value={<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>v{app.version}</code>} />}
              {app.manifest?.license?.trim() && (
                <AboutMetaRow
                  label="License"
                  value={
                    githubRepo ? (
                      <a href={`${githubRepo}/blob/main/LICENSE`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>
                        {app.manifest.license.trim()}
                      </a>
                    ) : (
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>{app.manifest.license.trim()}</code>
                    )
                  }
                />
              )}
              {app.runtime && (
                <AboutMetaRow label="Runtime" value={<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>{app.runtime}</code>} />
              )}
              {app.category && <AboutMetaRow label="Category" value={app.category} />}
              {createdByLabel && <AboutMetaRow label="Created by" value={createdByLabel} />}
            </div>

            {/* Stats panel */}
            {(summary || app.runs_7d != null) && (
              <div
                data-testid="about-stats"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}
              >
                <h4 style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 10px' }}>
                  Stats
                </h4>
                {app.runs_7d != null && app.runs_7d > 0 && (
                  <AboutMetaRow label="Runs (7d)" value={<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>{app.runs_7d.toLocaleString()}</code>} />
                )}
                {summary && summary.count > 0 && (
                  <>
                    <AboutMetaRow label="Ratings" value={<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5 }}>{summary.count}</code>} />
                    <AboutMetaRow label="Avg rating" value={<code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--accent)' }}>{summary.avg.toFixed(1)}/5</code>} />
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
        </>
        )}

        {/* Install tab. v26 parity: 3 install cards */}
        {activeTab === 'install' && (
        <section id="connectors" data-testid="connectors">
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880 }}
            data-testid="connectors-grid"
          >
            <InstallCard
              testId="connector-claude"
              title="Claude Desktop / Claude Code"
              desc={`Adds ${app.name} as a Skill. Run via natural language. MCP-installable via Skill add command.`}
              snippetValue={`claude skill add ${typeof window !== 'undefined' ? window.location.origin : ''}/p/${app.slug}`}
              copyLabel="Copy command"
            />
            <InstallCard
              testId="connector-cursor"
              title="Cursor / ChatGPT / any MCP client"
              desc="Add to your MCP config. The endpoint is the same; only the config file differs per client."
              snippetValue={mcpEndpoint}
              copyLabel="Copy MCP URL"
            />
            <InstallCard
              testId="connector-curl"
              title="cURL / JSON API"
              desc="Bearer-token auth with an Agent token. Same endpoint as the public page, just hit it programmatically."
              snippetValue={`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/apps/${app.slug}/run \\\n  -H "Authorization: Bearer floom_agent_••••••" \\\n  -H "Content-Type: application/json" \\\n  -d '{"inputs":{}}'`}
              copyLabel="Copy cURL"
              copySnippet={`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : ''}/api/apps/${app.slug}/run \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"inputs":{}}'`}
            />
          </div>
          <p
            data-testid="connectors-more"
            style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}
          >
            Need a token?{' '}
            <a
              href="/tokens"
              data-testid="connectors-tokens"
              style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
            >
              Mint one &rarr;
            </a>
          </p>
        </section>
        )}

        {/* Source tab. v26 parity: repo card + spec card + self-host card */}
        {activeTab === 'source' && (
          <section data-testid="tab-content-source">
            {!githubRepo && (
              <p
                data-testid="source-no-repo-note"
                style={{
                  fontSize: 12.5,
                  color: 'var(--muted)',
                  margin: '0 0 14px',
                  lineHeight: 1.55,
                }}
              >
                Source not publicly linked. Check with the app creator.
              </p>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: githubRepo ? '1fr 1fr' : '1fr',
                gap: 14,
                marginBottom: 14,
              }}
              className="source-cards-grid"
            >
              {/* Repo card — hidden when no github source linked */}
              {githubRepo && (
                <div
                  data-testid="source-repo-card"
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    padding: '18px 20px',
                  }}
                >
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                    Repository
                  </div>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <GithubIcon /> {githubRepo.replace('https://github.com/', '')}
                  </h3>
                  {app.manifest?.license && (
                    <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                      {app.manifest.license} licensed
                      {app.version ? ` · v${app.version}` : ''}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href={githubRepo}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        padding: '6px 12px',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        color: 'var(--ink)',
                        textDecoration: 'none',
                        background: 'var(--bg)',
                      }}
                    >
                      View on GitHub &rarr;
                    </a>
                  </div>
                </div>
              )}

              {/* Spec card */}
              <div
                data-testid="source-spec-card"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '18px 20px',
                }}
              >
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                  Spec (floom.json)
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Deterministic JSON schema for actions and inputs.
                </p>
                <SourceSnippet
                  value={JSON.stringify({
                    slug: app.slug,
                    version: app.version ?? '0.1.0',
                    actions: Object.keys(app.manifest?.actions ?? {}).slice(0, 2),
                  }, null, 2)}
                />
                <a
                  href={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/apps/${app.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ marginTop: 10, display: 'inline-block', fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
                >
                  View raw spec &rarr;
                </a>
              </div>
            </div>

            {/* Self-host card (full width) */}
            <div
              data-testid="source-selfhost-card"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '18px 20px',
              }}
            >
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
                Self-host
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 8px' }}>Run this app on your own infra.</h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.55 }}>
                One Docker command. Bring your own API key. Yours forever.
              </p>
              <SourceSnippet
                value={`docker run -e GEMINI_BYOK=$KEY -p 3000:3000 ghcr.io/floomhq/${app.slug}:latest`}
              />
            </div>
          </section>
        )}

        {/* R10 (2026-04-28): Earlier runs tab */}
        {activeTab === 'runs' && (
          <section data-testid="tab-content-runs">
            <div
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10.5,
                color: 'var(--muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              Earlier runs
            </div>
            <PastRunsDisclosure appSlug={app.slug} defaultOpen />
          </section>
        )}
          </div>
          {/* /frame body */}
        </div>
        {/* /permalink-card */}
      </main>
      <FloomFooter />
      <FeedbackButton />

      {app && (
        <ShareModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          slug={app.slug}
          appName={app.name}
          visibility={app.visibility}
          shareUrl={shareModalUrl || (typeof window !== 'undefined' ? window.location.href : '')}
          isOwner={!!(app.author && sessionUserId && app.author === sessionUserId)}
        />
      )}

      {app && (
        <SkillModal
          open={claudeSkillModalOpen}
          onClose={() => setClaudeSkillModalOpen(false)}
          slug={app.slug}
          appName={app.name}
          firstInputName={claudeSkillFirstInput}
        />
      )}

    </div>
  );
}

/* ----------------- TabBar with sliding underline ----------------- */

const TABS: Array<{ id: 'run' | 'about' | 'install' | 'source' | 'runs'; label: string }> = [
  { id: 'run', label: 'Run' },
  { id: 'about', label: 'About' },
  { id: 'install', label: 'Install' },
  { id: 'source', label: 'Source' },
  { id: 'runs', label: 'History' },
];

function TabBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: 'run' | 'about' | 'install' | 'source' | 'runs';
  setActiveTab: (t: 'run' | 'about' | 'install' | 'source' | 'runs') => void;
}) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = tabRefs.current.get(activeTab);
    if (el) {
      const { offsetLeft, offsetWidth } = el;
      setIndicator({ left: offsetLeft, width: offsetWidth });
    }
  }, [activeTab]);

  const tabBtnStyle = (isOn: boolean): CSSProperties => ({
    padding: '11px 16px',
    fontSize: 13.5,
    fontWeight: isOn ? 600 : 500,
    border: 'none',
    background: 'transparent',
    color: isOn ? 'var(--ink)' : 'var(--muted)',
    marginBottom: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    transition: 'color .14s',
    letterSpacing: isOn ? '-0.01em' : undefined,
  });

  return (
    <div
      role="tablist"
      aria-label="App content"
      data-testid="permalink-tabs"
      className="permalink-tab-bar"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: 0,
        padding: 0,
        borderBottom: '1px solid var(--line)',
        background: 'transparent',
        position: 'relative',
      }}
    >
      {TABS.map((t) => {
        const isOn = activeTab === t.id;
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el);
              else tabRefs.current.delete(t.id);
            }}
            type="button"
            role="tab"
            aria-selected={isOn}
            data-testid={`permalink-tab-${t.id}`}
            data-state={isOn ? 'active' : 'inactive'}
            onClick={() => setActiveTab(t.id)}
            style={tabBtnStyle(isOn)}
          >
            {t.label}
          </button>
        );
      })}
      {/* Sliding underline indicator */}
      {indicator && (
        <div
          className="permalink-tab-underline"
          style={{
            position: 'absolute',
            bottom: -1,
            left: indicator.left,
            width: indicator.width,
            height: 2,
            background: 'var(--accent)',
            borderRadius: '1px 1px 0 0',
            transition: 'left 0.18s cubic-bezier(0.22, 1, 0.36, 1), width 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

/* ----------------- small components ----------------- */

function InstallCard({
  testId,
  title,
  desc,
  snippetValue,
  copyLabel,
  copySnippet,
}: {
  testId: string;
  title: string;
  desc: string;
  snippetValue: string;
  copyLabel: string;
  copySnippet?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try {
      void navigator.clipboard.writeText(copySnippet ?? snippetValue).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } catch { /* ignore */ }
  };
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: '18px 20px',
      }}
    >
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: 'var(--ink)' }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.55 }}>{desc}</p>
      {/* R7 U5: light tinted --studio bg (matches SourceSnippet + global "no black copy boxes" rule) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--studio, #f5f4f0)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: '8px 10px',
        }}
      >
        <span
          style={{
            flex: 1,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 12,
            color: 'var(--ink)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
          dangerouslySetInnerHTML={{ __html: snippetValue.replace(/\n/g, '<br/>') }}
        />
        <button
          type="button"
          onClick={handleCopy}
          style={{
            background: 'var(--card)',
            color: copied ? 'var(--muted)' : 'var(--accent)',
            border: `1px solid ${copied ? 'var(--line)' : 'rgba(4,120,87,0.35)'}`,
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {copied ? 'Copied' : copyLabel}
        </button>
      </div>
    </div>
  );
}

function SourceSnippet({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try {
      void navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } catch { /* ignore */ }
  };
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        background: 'var(--studio, #f5f4f0)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: '8px 10px',
        marginTop: 8,
      }}
    >
      <pre
        style={{
          flex: 1,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 11.5,
          color: 'var(--ink)',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.55,
        }}
      >
        {value}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          background: 'var(--card)',
          color: copied ? 'var(--muted)' : 'var(--accent)',
          border: `1px solid ${copied ? 'var(--line)' : 'rgba(4,120,87,0.35)'}`,
          borderRadius: 6,
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function AboutMetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderBottom: '1px solid var(--line)',
        fontSize: 12.5,
      }}
    >
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--ink)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={18} cy={5} r={3} stroke="currentColor" strokeWidth="1.8" />
      <circle cx={6} cy={12} r={3} stroke="currentColor" strokeWidth="1.8" />
      <circle cx={18} cy={19} r={3} stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function StarsRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div style={{ display: 'inline-flex', gap: 1, color: '#f2b100' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={n <= Math.round(value) ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </div>
  );
}

function RatingsWidget({ summary }: { summary: ReviewSummary }) {
  return (
    <div
      data-testid="ratings-widget"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        marginBottom: 28,
        paddingBottom: 24,
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1,
            color: 'var(--ink)',
            letterSpacing: '-0.02em',
          }}
        >
          {summary.avg.toFixed(1)}
        </div>
        <div style={{ marginTop: 8 }}>
          <StarsRow value={summary.avg} size={16} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {summary.count} rating{summary.count === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}

function CelebrationCard({
  slug,
  copied,
  onCopy,
  onDismiss,
}: {
  slug: string;
  copied: boolean;
  onCopy: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="celebration-card"
      style={{
        marginTop: 18,
        padding: '18px 20px',
        borderRadius: 14,
        border: '1px solid var(--accent, #10b981)',
        background: 'rgba(16, 185, 129, 0.06)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ fontSize: 15, color: 'var(--ink, #0f172a)' }}>
          Your app is live
        </strong>
        <p style={{ margin: '4px 0 8px', color: 'var(--muted, #64748b)', fontSize: 13 }}>
          This link works for anyone — send it to coworkers, Twitter, anywhere.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 7,
            background: '#fff5e8',
            border: '1px solid #f5cf90',
            borderRadius: 8,
            padding: '8px 11px',
            fontSize: 12,
            color: '#7c5400',
            lineHeight: 1.5,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span><strong>Floom is in public beta</strong> — please don&rsquo;t put production secrets in apps you publish here. We&rsquo;re hardening secret isolation and will lift this when sandboxing is GA.</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
        <button
          type="button"
          data-testid="celebration-copy"
          onClick={onCopy}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--accent, #10b981)',
            color: '#fff',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied!' : 'Copy share link'}
        </button>
        <Link
          href="/"
          data-testid="celebration-make-another"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: 'var(--card, #fff)',
            color: 'var(--ink, #0f172a)',
            border: '1px solid var(--line, #e5e7eb)',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Back to home
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss celebration for ${slug}`}
          style={{
            padding: '8px 10px',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--muted, #64748b)',
            border: 'none',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
