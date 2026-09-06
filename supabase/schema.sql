begin;

create table if not exists public.ministore_organizations (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministore_records (
  owner_id uuid not null references auth.users (id) on delete cascade,
  app_id text not null,
  table_name text not null,
  record_id text not null,
  payload jsonb,
  deleted_at timestamptz,
  updated_at timestamptz not null,
  device_id text,
  sync_version bigint,
  primary key (owner_id, app_id, table_name, record_id)
);

create table if not exists public.ministore_app_versions (
  owner_id uuid not null references auth.users (id) on delete cascade,
  app_id text not null,
  version_id text not null,
  app_name text not null,
  app_version text not null,
  prompt text not null,
  provider_name text not null,
  payload jsonb not null,
  created_at timestamptz not null,
  primary key (owner_id, app_id, version_id)
);

create index if not exists ministore_records_pull_idx
  on public.ministore_records (owner_id, app_id, updated_at);

create index if not exists ministore_records_table_idx
  on public.ministore_records (owner_id, app_id, table_name);

create index if not exists ministore_app_versions_app_idx
  on public.ministore_app_versions (owner_id, app_id, created_at desc);

alter table public.ministore_organizations enable row level security;
alter table public.ministore_records enable row level security;
alter table public.ministore_app_versions enable row level security;

grant select, insert, update, delete on public.ministore_organizations to authenticated;
grant select, insert, update, delete on public.ministore_records to authenticated;
grant select, insert, update, delete on public.ministore_app_versions to authenticated;

drop policy if exists "Users can read their MiniStore organization" on public.ministore_organizations;
drop policy if exists "Users can create their MiniStore organization" on public.ministore_organizations;
drop policy if exists "Users can update their MiniStore organization" on public.ministore_organizations;
drop policy if exists "Users can delete their MiniStore organization" on public.ministore_organizations;

create policy "Users can read their MiniStore organization"
  on public.ministore_organizations
  for select
  using (auth.uid() = owner_id);

create policy "Users can create their MiniStore organization"
  on public.ministore_organizations
  for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their MiniStore organization"
  on public.ministore_organizations
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their MiniStore organization"
  on public.ministore_organizations
  for delete
  using (auth.uid() = owner_id);

drop policy if exists "Users can read their own MiniStore records" on public.ministore_records;
drop policy if exists "Users can insert their own MiniStore records" on public.ministore_records;
drop policy if exists "Users can update their own MiniStore records" on public.ministore_records;
drop policy if exists "Users can delete their own MiniStore records" on public.ministore_records;

create policy "Users can read their own MiniStore records"
  on public.ministore_records
  for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own MiniStore records"
  on public.ministore_records
  for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own MiniStore records"
  on public.ministore_records
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own MiniStore records"
  on public.ministore_records
  for delete
  using (auth.uid() = owner_id);

drop policy if exists "Users can read their own AppFoundry app versions" on public.ministore_app_versions;
drop policy if exists "Users can insert their own AppFoundry app versions" on public.ministore_app_versions;
drop policy if exists "Users can update their own AppFoundry app versions" on public.ministore_app_versions;
drop policy if exists "Users can delete their own AppFoundry app versions" on public.ministore_app_versions;

create policy "Users can read their own AppFoundry app versions"
  on public.ministore_app_versions
  for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own AppFoundry app versions"
  on public.ministore_app_versions
  for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own AppFoundry app versions"
  on public.ministore_app_versions
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own AppFoundry app versions"
  on public.ministore_app_versions
  for delete
  using (auth.uid() = owner_id);

commit;
