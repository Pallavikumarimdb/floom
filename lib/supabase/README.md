# Supabase Lane

This lane is server-only. Do not import `lib/supabase/server.ts` or `lib/supabase/app-registry.ts` from client components or browser bundles.

Required runtime environment:

- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for trusted server routes and workers

Required runtime dependency:

- `@supabase/supabase-js`

The service-role key is only read inside `createSupabaseServiceRoleClient()`. Keep that helper behind server routes, server actions, jobs, or workers.

Registry helpers:

- `getAppBySlug(slug, client?)`
- `createExecution(input, client?)`

Both helpers default to a service-role client so API routes can resolve private/unlisted apps and create execution rows without exposing credentials to the browser. Pass an authenticated user client when RLS enforcement is required for a request path.
