create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ensure_app_current_version_matches()
returns trigger
language plpgsql
as $$
begin
  if new.current_version_id is not null and not exists (
    select 1
    from public.app_versions v
    where v.id = new.current_version_id
      and v.app_id = new.id
  ) then
    raise exception 'current_version_id must reference a version for the same app';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_execution_version_matches()
returns trigger
language plpgsql
as $$
begin
  if new.version_id is not null and not exists (
    select 1
    from public.app_versions v
    where v.id = new.version_id
      and v.app_id = new.app_id
  ) then
    raise exception 'version_id must reference a version for the same app';
  end if;

  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_format check (
    email is null or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  prompt text,
  visibility text not null default 'private',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apps_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint apps_visibility_check check (visibility in ('private', 'unlisted', 'public'))
);

create unique index apps_slug_key on public.apps (slug);
create index apps_owner_id_idx on public.apps (owner_id);
create index apps_visibility_idx on public.apps (visibility);

create trigger apps_set_updated_at
before update on public.apps
for each row execute function public.set_updated_at();

create table public.app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  version_number integer not null,
  source jsonb not null default '{}'::jsonb,
  manifest jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint app_versions_version_positive check (version_number > 0),
  constraint app_versions_status_check check (status in ('draft', 'published', 'archived')),
  constraint app_versions_app_version_key unique (app_id, version_number)
);

create index app_versions_app_id_idx on public.app_versions (app_id);
create index app_versions_status_idx on public.app_versions (status);

alter table public.apps
add constraint apps_current_version_id_fkey
foreign key (current_version_id) references public.app_versions(id) on delete set null
deferrable initially deferred;

create trigger apps_current_version_matches
before insert or update of current_version_id on public.apps
for each row execute function public.ensure_app_current_version_matches();

create table public.executions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  version_id uuid references public.app_versions(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  share_link_id uuid,
  session_id text,
  inputs jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'queued',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executions_status_check check (
    status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  constraint executions_completed_after_started check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create index executions_app_id_created_at_idx on public.executions (app_id, created_at desc);
create index executions_user_id_created_at_idx on public.executions (user_id, created_at desc);
create index executions_status_idx on public.executions (status);

create trigger executions_set_updated_at
before update on public.executions
for each row execute function public.set_updated_at();

create trigger executions_version_matches
before insert or update of app_id, version_id on public.executions
for each row execute function public.ensure_execution_version_matches();

create table public.app_share_links (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  token_hash text not null,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  is_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_share_links_token_hash_key unique (token_hash),
  constraint app_share_links_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint app_share_links_use_count_nonnegative check (use_count >= 0)
);

create index app_share_links_app_id_idx on public.app_share_links (app_id);
create index app_share_links_active_idx on public.app_share_links (token_hash)
where is_revoked = false;

create trigger app_share_links_set_updated_at
before update on public.app_share_links
for each row execute function public.set_updated_at();

alter table public.executions
add constraint executions_share_link_id_fkey
foreign key (share_link_id) references public.app_share_links(id) on delete set null;

create or replace function public.can_read_app(target_app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.apps a
    where a.id = target_app_id
      and (
        a.visibility = 'public'
        or a.owner_id = auth.uid()
      )
  );
$$;

create or replace function public.can_create_execution(target_app_id uuid, target_share_link_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_read_app(target_app_id)
    or exists (
      select 1
      from public.app_share_links l
      where l.id = target_share_link_id
        and l.app_id = target_app_id
        and l.is_revoked = false
        and (l.expires_at is null or l.expires_at > now())
        and (l.max_uses is null or l.use_count < l.max_uses)
    );
$$;

create or replace function public.owns_app(target_app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.apps a
    where a.id = target_app_id
      and a.owner_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.app_versions enable row level security;
alter table public.executions enable row level security;
alter table public.app_share_links enable row level security;

create policy "profiles are readable by owner"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "profiles are insertable by owner"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "profiles are updatable by owner"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "public apps are readable and owners can read their apps"
on public.apps for select
to anon, authenticated
using (visibility = 'public' or owner_id = auth.uid());

create policy "authenticated users can create owned apps"
on public.apps for insert
to authenticated
with check (owner_id = auth.uid());

create policy "owners can update apps"
on public.apps for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "owners can delete apps"
on public.apps for delete
to authenticated
using (owner_id = auth.uid());

create policy "read versions for readable apps"
on public.app_versions for select
to anon, authenticated
using (public.can_read_app(app_id));

create policy "owners can create app versions"
on public.app_versions for insert
to authenticated
with check (public.owns_app(app_id) and created_by = auth.uid());

create policy "owners can update app versions"
on public.app_versions for update
to authenticated
using (public.owns_app(app_id))
with check (public.owns_app(app_id));

create policy "owners can delete app versions"
on public.app_versions for delete
to authenticated
using (public.owns_app(app_id));

create policy "owners can read app executions"
on public.executions for select
to authenticated
using (public.owns_app(app_id) or user_id = auth.uid());

create policy "authenticated users can create executions for readable apps"
on public.executions for insert
to authenticated
with check (public.can_create_execution(app_id, share_link_id) and (user_id is null or user_id = auth.uid()));

create policy "anonymous users can create public executions"
on public.executions for insert
to anon
with check (public.can_create_execution(app_id, share_link_id) and user_id is null);

create policy "owners can update app executions"
on public.executions for update
to authenticated
using (public.owns_app(app_id))
with check (public.owns_app(app_id));

create policy "owners can read share links"
on public.app_share_links for select
to authenticated
using (public.owns_app(app_id) or created_by = auth.uid());

create policy "owners can create share links"
on public.app_share_links for insert
to authenticated
with check (public.owns_app(app_id) and created_by = auth.uid());

create policy "owners can update share links"
on public.app_share_links for update
to authenticated
using (public.owns_app(app_id))
with check (public.owns_app(app_id));

create policy "owners can delete share links"
on public.app_share_links for delete
to authenticated
using (public.owns_app(app_id));
