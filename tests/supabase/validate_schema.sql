begin;

do $$
declare
  missing text[];
begin
  select array_agg(name order by name)
  into missing
  from unnest(array['profiles', 'apps', 'app_versions', 'executions', 'app_share_links']) as expected(name)
  where to_regclass('public.' || expected.name) is null;

  if missing is not null then
    raise exception 'Missing tables: %', array_to_string(missing, ', ');
  end if;
end;
$$;

do $$
declare
  missing text[];
begin
  select array_agg(tablename order by tablename)
  into missing
  from pg_tables
  where schemaname = 'public'
    and tablename in ('profiles', 'apps', 'app_versions', 'executions', 'app_share_links')
    and rowsecurity = false;

  if missing is not null then
    raise exception 'RLS is disabled for tables: %', array_to_string(missing, ', ');
  end if;
end;
$$;

do $$
declare
  missing text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing
  from unnest(array[
    'profiles are readable by owner',
    'profiles are insertable by owner',
    'profiles are updatable by owner',
    'public apps are readable and owners can read their apps',
    'authenticated users can create owned apps',
    'owners can update apps',
    'owners can delete apps',
    'read versions for readable apps',
    'owners can create app versions',
    'owners can update app versions',
    'owners can delete app versions',
    'owners can read app executions',
    'authenticated users can create executions for readable apps',
    'anonymous users can create public executions',
    'owners can update app executions',
    'owners can read share links',
    'owners can create share links',
    'owners can update share links',
    'owners can delete share links'
  ]) as expected(name)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.policyname = expected.name
  );

  if missing is not null then
    raise exception 'Missing policies: %', array_to_string(missing, ', ');
  end if;
end;
$$;

do $$
declare
  missing text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing
  from unnest(array[
    'set_updated_at',
    'ensure_app_current_version_matches',
    'ensure_execution_version_matches',
    'can_read_app',
    'can_create_execution',
    'owns_app'
  ]) as expected(name)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = expected.name
  );

  if missing is not null then
    raise exception 'Missing functions: %', array_to_string(missing, ', ');
  end if;
end;
$$;

do $$
declare
  missing text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing
  from unnest(array[
    'profiles_set_updated_at',
    'apps_set_updated_at',
    'apps_current_version_matches',
    'executions_set_updated_at',
    'executions_version_matches',
    'app_share_links_set_updated_at'
  ]) as expected(name)
  where not exists (
    select 1
    from pg_trigger t
    where t.tgname = expected.name
      and not t.tgisinternal
  );

  if missing is not null then
    raise exception 'Missing triggers: %', array_to_string(missing, ', ');
  end if;
end;
$$;

do $$
declare
  missing text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing
  from unnest(array[
    'profiles_email_format',
    'apps_slug_format',
    'apps_visibility_check',
    'app_versions_version_positive',
    'app_versions_status_check',
    'executions_status_check',
    'executions_completed_after_started',
    'app_share_links_max_uses_positive',
    'app_share_links_use_count_nonnegative'
  ]) as expected(name)
  where not exists (
    select 1
    from pg_constraint c
    where c.conname = expected.name
      and c.contype = 'c'
  );

  if missing is not null then
    raise exception 'Missing check constraints: %', array_to_string(missing, ', ');
  end if;
end;
$$;

do $$
declare
  missing text[];
begin
  select array_agg(expected.name order by expected.name)
  into missing
  from unnest(array[
    'apps_slug_key',
    'apps_owner_id_idx',
    'apps_visibility_idx',
    'app_versions_app_id_idx',
    'app_versions_status_idx',
    'executions_app_id_created_at_idx',
    'executions_user_id_created_at_idx',
    'executions_status_idx',
    'app_share_links_app_id_idx',
    'app_share_links_active_idx'
  ]) as expected(name)
  where not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = expected.name
      and c.relkind = 'i'
  );

  if missing is not null then
    raise exception 'Missing indexes: %', array_to_string(missing, ', ');
  end if;
end;
$$;

do $$
begin
  insert into auth.users (id)
  values ('00000000-0000-0000-0000-000000000001');

  insert into public.profiles (id, email)
  values ('00000000-0000-0000-0000-000000000001', 'owner@example.com');

  insert into public.apps (owner_id, slug, name, visibility)
  values ('00000000-0000-0000-0000-000000000001', 'demo-app', 'Demo App', 'public');

  insert into public.app_versions (app_id, version_number, created_by, status)
  select id, 1, owner_id, 'published'
  from public.apps
  where slug = 'demo-app';

  insert into public.app_share_links (app_id, token_hash, created_by, max_uses)
  select id, encode(sha256('demo-token'::bytea), 'hex'), owner_id, 10
  from public.apps
  where slug = 'demo-app';

  insert into public.executions (app_id, version_id, inputs, status)
  select a.id, v.id, '{"ok": true}'::jsonb, 'queued'
  from public.apps a
  join public.app_versions v on v.app_id = a.id
  where a.slug = 'demo-app';
end;
$$;

rollback;
