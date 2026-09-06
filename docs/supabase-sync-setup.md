# BYO Supabase Sync Setup

Date: 2026-09-04

AppFoundry open-source sync uses a tenant-owned Supabase project. AppFoundry does not provision,
administer, or store metadata about the tenant's Supabase infrastructure in this mode.

## Privacy Boundary

The tenant keeps control of:

- Supabase account, organization, and project.
- Database password, service-role key, Management API tokens, and OAuth grants.
- Business data stored in `public.ministore_records`.
- AI-generated app versions stored in `public.ministore_app_versions`.

AppFoundry stores only local app configuration on the tenant device:

- Supabase project URL.
- Supabase anon/publishable key.
- Signed-in Supabase Auth session for the app user.
- Optional organization display name row in the tenant database.
- AI provider configuration and API key.

Do not paste service-role keys, database passwords, Management API tokens, or OAuth client secrets
into the AppFoundry app.

## Tenant Setup Steps

1. Create a Supabase project in the tenant's own Supabase account.
2. Open the Supabase SQL editor or use the Supabase CLI.
3. Run [`../supabase/schema.sql`](../supabase/schema.sql).
4. Copy the project URL from Project Settings > API.
5. Copy the anon/publishable API key from Project Settings > API.
6. Open AppFoundry and enter the project URL, publishable key, and sync table name
   `ministore_records`.
7. Create or sign in to the Supabase Auth account from AppFoundry.
8. Name the AppFoundry organization and finish onboarding.
9. Configure an AI provider in Settings before using app customization.

## Optional Environment Prefill

For development builds, the public Supabase values can be prefilled with Expo public environment
variables:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_SUPABASE_TABLE_NAME=ministore_records
```

Hosts can also set the same public values before the app bundle runs:

```ts
globalThis.__MINISTORE_CLOUD_SYNC__ = {
  engine: 'supabase',
  supabaseUrl: 'https://PROJECT_REF.supabase.co',
  supabaseAnonKey: 'SUPABASE_PUBLISHABLE_KEY',
  tableName: 'ministore_records',
};
```

These values are public runtime configuration. Sync still requires a signed-in Supabase Auth user,
and row-level security protects data by `auth.uid()`.

## Database Schema

The canonical migration is [`../supabase/schema.sql`](../supabase/schema.sql). It creates:

- `public.ministore_organizations`
- `public.ministore_records`
- `public.ministore_app_versions`
- Pull indexes for app/table/watermark sync.
- RLS policies that require `auth.uid() = owner_id`.
- Authenticated-role table grants required for Supabase REST access.

The sync engine uses tombstones instead of hard remote deletes, so normal runtime deletes are stored
by setting `deleted_at`.

AI app customization stores the full validated app definition in `ministore_app_versions.payload`
with the prompt, provider name, app ID, and generated version ID. Provider API keys remain in local
device storage and are not written to Supabase.

## Sync Semantics

- Local writes are applied first.
- Every create/update/delete is persisted in a local outbox before network sync.
- Push uses Supabase REST upsert against `(owner_id, app_id, table_name, record_id)`.
- Pull uses an `updated_at` watermark per app.
- Remote deletes are applied locally from tombstones.
- Push failures are retained in the outbox with retry metadata and exponential backoff.
- Pull is skipped while local mutations are pending, so unsent local edits are not overwritten by
  remote state.
- The first conflict policy is deterministic last-write-wins by `updated_at`; `device_id` and
  `sync_version` are stored for diagnostics and future conflict handling.

## Managed Provisioning

Managed provisioning is intentionally out of scope for the open-source BYO Supabase version. A future
managed edition can add an opt-in provisioning service, but that service must be clearly separated
from this private setup path because it requires tenant authorization during provisioning.
