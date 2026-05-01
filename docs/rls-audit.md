# RLS Audit — Supabase Migrations
**Date:** 2026-05-01  
**Source:** supabase/migrations/*.sql (5 files)  
**Method:** Static read — no live Supabase queries

---

## Migration Overview

| File | Purpose |
|------|---------|
| 20260429120000_remote_baseline.sql | Empty baseline marker — no schema changes |
| 20260430080000_floom_v0_core.sql | Core schema: all tables, indexes, triggers, RLS policies |
| 20260430093000_drop_public_metadata_policies.sql | Drops leftover "Public apps readable" and "Public app versions readable" anon policies |
| 20260430100000_retire_legacy_auth_trigger.sql | Drops legacy `on_auth_user_created` trigger that conflicted with upsert-safe replacement |
| 20260430103000_harden_app_bundle_storage.sql | Hardens `app-bundles` bucket (public=false), re-pins storage RLS policies, sets `agent_tokens.scopes` default |

All tables have RLS enabled (`alter table ... enable row level security`). The `public_run_rate_limits` table has no SELECT/INSERT/UPDATE/DELETE policy at the user level — it is only accessed via `service_role` through the `check_public_run_rate_limit` stored function.

---

## Per-Table RLS Analysis

### `public.profiles`

| Dimension | Detail |
|-----------|--------|
| **Who can write** | Only the owning user: `with check (id = auth.uid())` |
| **Who can read** | Only the owning user: `using (id = auth.uid())` |
| **Owner key** | `auth.uid()` matches the PK `id` (which is a FK to `auth.users.id`) |
| **Policies** | Single `for all` policy: "profiles are owned by user" |
| **Concerns** | None. One user cannot read or write another user's profile row. |
| **Good patterns** | `for all` with matching `using` and `with check` on the PK avoids the "read via SELECT, write via UPDATE/INSERT split" mistake. Cascade-delete from `auth.users` ensures orphan cleanup. |

---

### `public.apps`

| Dimension | Detail |
|-----------|--------|
| **Who can write** | Owner only (insert: `with check (owner_id = auth.uid())`, update/delete: `using (owner_id = auth.uid())`) |
| **Who can read** | Owner only: `using (owner_id = auth.uid())` — **no public read policy** |
| **Owner key** | `owner_id uuid references auth.users(id)` |
| **Policies** | 4 policies: "apps are readable by owner", "owners can create apps", "owners can update apps", "owners can delete apps" |
| **Public flag** | `apps.public boolean` exists but **is not used in any RLS policy**. Public apps are readable only through the API (which uses `service_role`/admin client) — NOT through direct Supabase anon or authenticated-user reads. The `20260430093000` migration explicitly dropped the old "Public apps are readable" anon policy. |
| **Concerns** | **Design gap, not a bug:** A caller with a valid JWT for user B cannot see user A's public apps via the Supabase client. All public-app access is routed through `src/app/api/apps/[slug]/route.ts` using the admin client. This is intentional (the migration comment confirms it: "Public app execution is mediated by Floom API routes") but it means the `apps.public` column is enforced only at the API layer, not the DB layer. If another DB-level consumer ever queries `apps` without going through the API, they would not see public apps. |
| **Good patterns** | Dropping the "Public apps are readable" anon RLS policy is correct: it prevents anon callers from enumerating all public apps via the Supabase anon key. Centralising public access through the API routes (using service_role) is a sensible v0 design. |

---

### `public.app_versions`

| Dimension | Detail |
|-----------|--------|
| **Who can write** | Owner of the parent app: `exists (select 1 from public.apps where apps.id = app_versions.app_id and apps.owner_id = auth.uid())` |
| **Who can read** | Same: owner of parent app only |
| **Owner key** | Indirect — ownership is determined via the parent `apps.owner_id` |
| **Policies** | 4 policies (select, insert, update, delete) all checking parent app ownership |
| **Concerns** | Same as `apps`: no anon or cross-user read policy. Direct Supabase client queries from non-owners return no rows. Public version metadata is only accessible via the API. |
| **Good patterns** | The join to `public.apps` for ownership check is correct. Using `exists` subquery is cheaper than a join and avoids multiple rows from the subquery causing policy expansion issues. |

---

### `public.agent_tokens`

| Dimension | Detail |
|-----------|--------|
| **Who can write** | Owner only: `with check (owner_id = auth.uid())` |
| **Who can read** | Owner only: `using (owner_id = auth.uid())` |
| **Owner key** | `owner_id uuid references auth.users(id)` |
| **Policies** | Single `for all` policy: "agent tokens are owned by user" |
| **Sensitive columns** | `token_hash text` — SHA-256 hex of the raw token; never the raw token. `token_prefix text` — first 8 chars exposed for display. `revoked_at`, `expires_at`, `scopes` — all gated by owner-only policy. |
| **Concerns** | `token_hash` is in the public schema and accessible by the owning user. This is by design (owner manages their own tokens). The hash itself is one-way so access to the hash row doesn't expose the raw token. The pepper for HMAC (env var `AGENT_TOKEN_PEPPER`) is server-only and not visible in the schema. |
| **No concern:** | A non-owner cannot read any token rows, including hashes. A user cannot enumerate another user's tokens. |
| **Good patterns** | Storing only the hash and prefix (never the raw token) is correct. Revocation via `revoked_at` rather than hard-delete preserves audit trail. `expires_at` is nullable (no expiry) rather than requiring expiry. |

---

### `public.executions`

| Dimension | Detail |
|-----------|--------|
| **Who can insert** | Anyone for public apps (no auth required), or the app owner, as long as `caller_agent_token_id is null` at the RLS level. Insert policy: `apps.public OR apps.owner_id = auth.uid()`, and `caller_user_id IS NULL OR caller_user_id = auth.uid()`, and `caller_agent_token_id IS NULL`. |
| **Who can read** | `caller_user_id = auth.uid()` OR app owner: `apps.owner_id = auth.uid()` |
| **Who can update** | App owner only |
| **Owner key** | Dual: `caller_user_id` (the caller) and `apps.owner_id` (the app owner) |
| **Policies** | 3 policies: "executions are readable by app owner or caller", "public users and owners can create executions", "owners can update executions" |
| **Concerns — one real gap:** | The INSERT policy allows `caller_agent_token_id IS NULL` at the DB level, but the API route (`run/route.ts`) sets `caller_agent_token_id` when an agent token is the caller. Since all inserts go through the API using the service_role admin client, the RLS INSERT policy on `executions` is **not enforced at runtime** — the admin client bypasses RLS. The INSERT policy therefore only matters for direct Supabase client inserts. This means: (a) the `caller_agent_token_id IS NULL` check in the policy doesn't protect anything today; (b) if a future code path ever inserts executions as a user-role client, the policy would incorrectly block agent-token-originated inserts. |
| **Second concern:** | There is no DELETE policy for executions. An app owner or caller cannot delete their execution records. This may be intentional for audit purposes, but it means execution data accumulates with no way for users to clean it up through the Supabase client. |
| **Good patterns** | The dual-owner read design (both caller and app owner can read) is correct. The app-owner-only update policy protects status/error fields from being overwritten by the caller. |

---

### `public.public_run_rate_limits`

| Dimension | Detail |
|-----------|--------|
| **Who can read** | Nobody via Supabase client (no SELECT policy) — only service_role |
| **Who can write** | Nobody via Supabase client — only the `check_public_run_rate_limit` stored function (which runs as `security definer` with `service_role` granted execute) |
| **Access pattern** | Function-only: `revoke all on function from public; grant execute to service_role` |
| **Concerns** | None. The rate-limit table is correctly shielded: no user-level policy, function access only. The function has a `null`/empty string guard and sanitises inputs. |
| **Good patterns** | Using a `security definer` function with explicit `revoke all from public; grant to service_role` is the correct pattern for internal system tables. The upsert logic with atomic `request_count +1` avoids race condition window issues. |

---

### `storage.objects` (app-bundles bucket)

| Dimension | Detail |
|-----------|--------|
| **Who can read** | Only the owning user: `(storage.foldername(name))[1] = auth.uid()::text` |
| **Who can write/update/delete** | Same: only the owning user, matched by first path segment |
| **Bucket public flag** | `false` — enforced both in the migration INSERT and in the harden migration via UPDATE |
| **Path convention** | Bundles are stored at `<owner_uid>/<slug>/<uuid>-<entrypoint>`. The first folder segment is the owner's UUID, so the RLS check is correct. |
| **Concerns** | The API route downloads bundles using the admin client (bypasses RLS) — the storage RLS policies therefore only matter if a user ever calls the Supabase storage API directly. They are still the correct defence-in-depth layer. |
| **Good patterns** | Repeating the bucket-hardening (`public = false`) in both migrations is belt-and-suspenders. Using `storage.foldername(name)[1]` for owner matching is the canonical Supabase pattern. |

---

## Top RLS Concerns

### 1. `executions` INSERT policy has a `caller_agent_token_id IS NULL` guard that the runtime bypasses
**Risk:** Low today (admin client bypasses it), but a future change that switches to user-role client for execution inserts would silently block agent-token-originated runs. The policy should either include `OR caller_agent_token_id IS NOT NULL` (accepting all agent-token inserts) or be dropped for the INSERT case (relying entirely on API-layer auth).

### 2. `apps.public` flag is enforced only at the API layer, not at the DB layer
**Risk:** Medium for future integrations. Any code path that queries `public.apps` via the authenticated Supabase client (not admin) will not see public apps — they will appear as if private. A v0 Supabase client library integration, Supabase Studio queries from a non-service-role connection, or a future backend feature that uses `createClient()` instead of `createAdminClient()` will silently return empty results for public apps. Consider adding a read policy `for select using (public = true)` to make the invariant DB-level.

### 3. No execution DELETE policy — users cannot clean up their run history
**Risk:** Low security risk but an operational concern. All execution rows persist indefinitely. There is no GDPR-friendly purge path for users. If run volume grows, this becomes a storage and privacy concern.

### 4. No RLS on `public.public_run_rate_limits` at all — implicit deny
**Risk:** Very low. No user-level policy means the default Supabase behavior (deny all) applies for non-service-role clients. This is correct but implicit. If someone accidentally grants `anon` or `authenticated` SELECT on this table in Studio, rate limit data (opaque keys, counts, timestamps) would be readable. An explicit `no user reads` comment or a deny-all policy would make this intent explicit rather than accidental.

---

## Approved Patterns

1. **Single `for all` policies for owner-only tables** (profiles, agent_tokens): correct — avoids split-policy inconsistencies where SELECT and INSERT have different owner checks.

2. **No anon-readable app/version policies**: the deliberate drop of "Public apps are readable" in migration `20260430093000` is correct. Centralising public read through the API (admin client) prevents anon enumeration via the Supabase anon key.

3. **`security definer` + `revoke/grant` for rate-limit function**: correct pattern for internal tables that should never be user-accessible.

4. **`token_hash` not `token`**: storing only the HMAC-SHA256 hash in `agent_tokens` is correct. The raw token is returned once on creation and never stored.

5. **Cascade deletes**: `apps → app_versions → executions` via `on delete cascade`; `auth.users → profiles`, `apps`, `agent_tokens` via `on delete cascade`. Clean referential integrity with no orphan risk.

6. **`app-bundles` bucket hardened to `public = false`** with the redundant UPDATE in the harden migration: belt-and-suspenders that ensures even if the INSERT ignored the flag, the bucket is still private.
