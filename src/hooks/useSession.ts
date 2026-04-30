'use client';
/**
 * useSession — Supabase-backed session hook for floom-minimal.
 *
 * TODO(v5-port): The original floom.dev hook (hooks/useSession.ts) wraps
 * GET /api/session/me and carries workspace/is_local logic. This port wraps
 * Supabase auth.getSession() directly since floom-minimal uses Supabase Auth.
 *
 * Shape kept compatible with the fields AppPermalinkPage + TopBar consume:
 *   data.user.id, data.user.email, data.user.name, data.user.image
 *   isAuthenticated
 *   refresh()
 */
import { useEffect, useState, useCallback } from 'react';

interface SessionUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  is_local?: boolean;
}

interface SessionData {
  user: SessionUser;
  session?: unknown;
}

interface SessionState {
  data: SessionData | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

let _cache: SessionState = { data: null, loading: false, error: null, isAuthenticated: false };
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

export function clearSession() {
  _cache = { data: null, loading: false, error: null, isAuthenticated: false };
  notify();
}

async function _fetchSession(): Promise<void> {
  _cache = { ..._cache, loading: true, error: null };
  notify();
  try {
    const hasConfig =
      typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!hasConfig) {
      _cache = { data: null, loading: false, error: null, isAuthenticated: false };
      notify();
      return;
    }

    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const u = session.user;
      _cache = {
        data: {
          user: {
            id: u.id,
            email: u.email ?? undefined,
            name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? undefined,
            image: u.user_metadata?.avatar_url ?? undefined,
            is_local: false,
          },
          session,
        },
        loading: false,
        error: null,
        isAuthenticated: true,
      };
    } else {
      _cache = { data: null, loading: false, error: null, isAuthenticated: false };
    }
  } catch (err) {
    _cache = {
      data: null,
      loading: false,
      error: (err as Error).message || 'Failed to load session',
      isAuthenticated: false,
    };
  }
  notify();
}

export function useSession(): SessionState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<SessionState>(_cache);

  useEffect(() => {
    function onUpdate() {
      setState({ ..._cache });
    }
    _listeners.add(onUpdate);
    // Trigger initial fetch if not yet loaded
    if (!_cache.loading && !_cache.data && !_cache.error) {
      void _fetchSession();
    }
    return () => {
      _listeners.delete(onUpdate);
    };
  }, []);

  const refresh = useCallback(async () => {
    await _fetchSession();
  }, []);

  return { ...state, refresh };
}
