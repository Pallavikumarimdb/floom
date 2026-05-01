-- Store only encrypted app secret values. Raw values are accepted by the API,
-- encrypted with FLOOM_SECRET_ENCRYPTION_KEY, and never written to app bundles,
-- app_versions, executions, or API/MCP responses.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.apps'::regclass
      and conname = 'apps_id_owner_id_key'
  ) then
    alter table public.apps
      add constraint apps_id_owner_id_key unique (id, owner_id);
  end if;
end;
$$;

create table if not exists public.app_secrets (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  value_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_secrets_app_owner_fkey
    foreign key (app_id, owner_id)
    references public.apps(id, owner_id)
    on delete cascade,
  constraint app_secrets_app_name_key unique (app_id, name),
  constraint app_secrets_name_format check (name ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  constraint app_secrets_ciphertext_format check (value_ciphertext ~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$')
);

alter table public.app_secrets enable row level security;

drop policy if exists "app secrets are readable by owner" on public.app_secrets;
drop policy if exists "app secrets are not directly readable" on public.app_secrets;
create policy "app secrets are not directly readable"
  on public.app_secrets
  for select
  using (false);

drop policy if exists "owners can create app secrets" on public.app_secrets;
create policy "owners can create app secrets"
  on public.app_secrets
  for insert
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.apps
      where apps.id = app_secrets.app_id
        and apps.owner_id = auth.uid()
    )
  );

drop policy if exists "owners can update app secrets" on public.app_secrets;
create policy "owners can update app secrets"
  on public.app_secrets
  for update
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.apps
      where apps.id = app_secrets.app_id
        and apps.owner_id = auth.uid()
    )
  );

drop policy if exists "owners can delete app secrets" on public.app_secrets;
create policy "owners can delete app secrets"
  on public.app_secrets
  for delete
  using (owner_id = auth.uid());

drop trigger if exists app_secrets_set_updated_at on public.app_secrets;
create trigger app_secrets_set_updated_at
  before update on public.app_secrets
  for each row
  execute function public.floom_set_updated_at();
