-- Keep Floom app bundles private and explicitly guarded by owner-scoped RLS.

insert into storage.buckets (id, name, public, file_size_limit)
values ('app-bundles', 'app-bundles', false, 1048576)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

update storage.buckets
set public = false
where id = 'app-bundles';

do $$
begin
  alter table storage.objects enable row level security;
exception
  when insufficient_privilege then
    -- Supabase-managed projects already own and configure storage.objects.
    null;
end;
$$;

alter table public.agent_tokens
  alter column scopes set default array['read', 'run', 'publish', 'revoke']::text[];

drop policy if exists "app bundles readable by owning user" on storage.objects;
create policy "app bundles readable by owning user"
  on storage.objects
  for select
  using (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "app bundles writable by owning user" on storage.objects;
create policy "app bundles writable by owning user"
  on storage.objects
  for insert
  with check (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "app bundles updateable by owning user" on storage.objects;
create policy "app bundles updateable by owning user"
  on storage.objects
  for update
  using (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "app bundles deletable by owning user" on storage.objects;
create policy "app bundles deletable by owning user"
  on storage.objects
  for delete
  using (
    bucket_id = 'app-bundles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
