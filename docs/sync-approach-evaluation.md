# SQLite <> Supabase Sync Approach Evaluation

Date: 2026-08-31

## Goal

Evaluate two candidate approaches for MiniStore local-first data sync:

1. WatermelonDB + Supabase RPC/Realtime
2. SQLite Sync by SQLiteAI

MiniStore constraints:

- Mini apps are downloaded templates authored by third parties.
- Templates can define arbitrary app tables.
- Runtime must work on web and mobile.
- Current data layer is a generic `CrudRepository`.
- Current native local store is SQLite via Expo SQLite.
- Supabase is the first cloud engine.
- Hosted Supabase should remain viable unless we explicitly choose a self-hosted cloud engine path.

## Option A: WatermelonDB + Supabase

Source: https://supabase.com/blog/react-native-offline-first-watermelon-db

### How it works

WatermelonDB owns the local data model. The app defines Watermelon schemas, models, and migrations,
then calls `synchronize()` with `pullChanges` and `pushChanges` functions. Supabase is used as the
remote Postgres backend, usually through RPC functions, and Realtime can be used to trigger sync on
other devices.

### Strengths

- Proven React Native offline-first architecture.
- Designed for large local datasets and reactive UI.
- Works with standard hosted Supabase because the server side is SQL/RPC plus regular Supabase
  features.
- Sync lifecycle is explicit and application-controlled.
- Web is possible through WatermelonDB's web adapter path, using IndexedDB-backed persistence rather
  than SQLite.

### Weaknesses for MiniStore

- WatermelonDB wants static schemas and generated model classes. MiniStore templates are dynamic, so
  every downloaded template would need runtime schema/model generation or a generic model layer that
  fights the framework.
- Supabase RPC must understand WatermelonDB's sync protocol and every table shape. For reusable
  third-party templates, this creates a backend migration/RPC burden per app/template.
- Conflict handling is simple last-write-wins, not CRDT-based merging.
- It would replace the current repository abstraction and force the renderer to adapt to WatermelonDB
  collection/query concepts.
- Web/mobile storage would not be the same engine: native uses SQLite, web uses LokiJS/IndexedDB.

### Fit

Good fit for a known product with a fixed schema. Weaker fit for MiniStore's generic downloaded-app
template architecture.

## Option B: SQLite Sync by SQLiteAI

Source: https://github.com/sqliteai/sqlite-sync

### How it works

SQLite Sync is a native SQLite extension. Apps continue writing to SQLite tables locally, while the
extension tracks changes and syncs them using CRDT semantics. It supports SQLite Cloud, PostgreSQL,
and Supabase destinations, and it publishes packages for Expo/React Native and WASM.

### Strengths

- Matches MiniStore's existing SQLite-first repository direction.
- Better theoretical fit for arbitrary template-defined tables because sync attaches to SQLite tables
  instead of requiring hand-written model classes per app.
- CRDT-based convergence is a stronger conflict model than simple last-write-wins.
- Reduces custom sync backend code compared with maintaining pull/push RPCs per template.
- Expo, React Native, iOS, Android, and WASM packages are advertised by the project.

### Weaknesses for MiniStore

- Supabase support appears to require a CloudSync-enabled Supabase/Postgres image or PostgreSQL
  extension path. That is compatible with self-hosted Supabase, but not the same as dropping into any
  hosted Supabase project.
- It requires loading native SQLite extensions. MiniStore currently uses Expo SQLite directly; this
  likely means moving the native repository to `op-sqlite` or another extension-capable SQLite layer.
- Web/WASM support needs a separate integration path and must be proven against Expo web bundling.
- The project is newer and more infrastructure-heavy than WatermelonDB. We should prototype before
  making it the default sync engine.
- Licensing and commercial usage terms need legal/product review before committing.

### Fit

Best architectural fit for MiniStore if we can accept self-hosted Supabase or a CloudSync-capable
Postgres deployment, and if the Expo/Web extension paths validate in a prototype.

## Revised Recommendation For BYO Hosted Supabase

Because MiniStore users bring their own regular Supabase Cloud project, do not choose SQLite Sync as
the primary sync engine. SQLite Sync is still architecturally attractive, but its Supabase path depends
on CloudSync/Postgres extension infrastructure that users cannot assume in a normal hosted Supabase
account.

Also do not choose WatermelonDB as the primary engine. It is better aligned with hosted Supabase, but
it is poorly aligned with MiniStore because templates are dynamic, user-customizable, and authored by
third parties. A WatermelonDB implementation would force static app schemas, model classes,
migrations, and per-schema Supabase sync functions into a product that needs schema flexibility.

The right approach for MiniStore is a custom generic local-first sync protocol over Supabase Cloud
primitives:

- Keep the local runtime SQLite-first behind `CrudRepository`.
- Store all synced records in one generic Supabase table, not one physical table per mini app.
- Use app/table/record identifiers plus a JSON payload to support arbitrary downloaded templates.
- Use a local durable outbox for offline create/update/delete mutations.
- Push batches to Supabase using REST/upsert or an optional Edge Function.
- Pull changes by `updated_at` watermark from the same generic table.
- Represent deletes as tombstones with `deleted_at`.
- Use row-level security with `owner_id` or `workspace_id` to isolate each user's data.
- Use deterministic conflict policy initially: last-write-wins by device timestamp plus conflict
  audit metadata. Add field-level or CRDT merge only for specific future field types that need it.

This keeps Supabase setup simple for users: they need a normal Supabase Cloud project, one table,
indexes, RLS policies, and optionally one Edge Function if we want server-side validation/batching.
The concrete SQL setup lives in `docs/supabase-sync-setup.md`.

## Why This Beats The Two Evaluated Options

Compared with WatermelonDB:

- Better for dynamic schemas because records are generic JSON payloads.
- No per-template model generation.
- No per-template Supabase RPC implementation.
- Easier to keep web and mobile on the same sync protocol.
- Keeps the renderer independent from any specific database framework.

Compared with SQLite Sync:

- Works with regular hosted Supabase Cloud.
- Avoids native SQLite extension loading in Expo as a prerequisite.
- Avoids separate CloudSync/Postgres deployment requirements for each user.
- Keeps onboarding feasible for BYO Supabase users.

The tradeoff is that MiniStore must own the sync protocol: outbox, pull, retry, conflict policy, and
sync status are product code rather than delegated to WatermelonDB or SQLite Sync.

## Implementation Plan After Approval

1. Add a durable local `sync_outbox` table on mobile SQLite and equivalent IndexedDB storage on web.
2. Define the hosted Supabase schema:
   - `owner_id uuid`
   - `app_id text`
   - `table_name text`
   - `record_id text`
   - `payload jsonb`
   - `deleted_at timestamptz null`
   - `updated_at timestamptz`
   - `device_id text`
   - `sync_version bigint`
   - unique key on `(owner_id, app_id, table_name, record_id)`
3. Add push sync using Supabase upsert with idempotent mutation batches.
4. Add pull sync using `updated_at` watermarks and tombstone reconciliation.
5. Add row-level security setup SQL and setup guidance for users.
6. Add conflict metadata and start with last-write-wins.
7. Add sync status UI and retry controls.
8. Add integration tests with a mock Supabase REST endpoint before testing against a live Supabase
   Cloud project.
