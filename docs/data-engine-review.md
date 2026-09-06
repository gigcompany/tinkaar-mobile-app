# Data Engine Review

## Scope

Reviewed the data handling path for MiniStore apps:

- Declarative actions in `src/renderer/actions.ts`
- Runtime repository creation in `App.tsx`
- Generic repository contract in `src/data/repository.ts`
- Native SQLite implementation in `src/data/sqliteRepository.native.ts`
- Web SQLite fallback in `src/data/sqliteRepository.web.ts`
- Installed-template persistence in `src/apps/installedTemplateStore.*.ts`
- Supabase two-way sync coordinator in `src/data/cloudSync.ts`
- Platform sync outbox/watermark stores in `src/data/cloudSyncStore.*.ts`

## Current Architecture

The runtime creates one repository per selected app. Templates declare a local storage adapter in
`AppDefinition.data.storage`; native apps use Expo SQLite when the adapter is `sqlite`, while web
uses a synchronous localStorage-backed repository for the same `sqlite` adapter contract.

All generated mini apps use the same CRUD surface:

- `getRecords(tableName)`
- `upsertRecord(tableName, record)`
- `createRecord(tableName, values)`
- `updateRecord(tableName, recordId, patch)`
- `deleteRecord(tableName, recordId)`
- `subscribe(listener)`

Supabase sync is a wrapper around the local repository. Local writes happen first, then
creates/updates/deletes are persisted to a durable outbox before network sync. The sync coordinator
pushes queued mutations to a generic Supabase table and pulls remote changes by watermark.

## Priority Findings

### P0: No blocking correctness issue found for the current MVP path

The current create/update/delete path is coherent for small local-first apps:

- `App.tsx` creates one repository for the selected template and wraps it with cloud sync only when
  host Supabase config exists.
- `dispatchAction` gates creates, updates, and deletes through declared app operations before writing.
- `sanitizeRecordPatch` limits persisted draft keys to fields declared by the active table.
- Native SQLite uses parameterized values for row data and generated physical table names for
  app/table isolation.

### Resolved: Supabase sync is now durable

`src/data/cloudSync.ts` now persists create/update/delete mutations in a platform local outbox before
network sync. Native uses `ministore_sync.db`; web stores sync state in localStorage. Failures retain
outbox rows with retry metadata and exponential backoff, and the runtime exposes sync status plus a
manual retry control.

Required production work:

- Add background sync when the app is inactive.
- Add richer per-record diagnostics for advanced troubleshooting.

### Resolved: Sync is now two-way

The Supabase integration pushes local mutations and pulls remote rows by `updated_at` watermark.
Remote tombstones are applied as local deletes. Pull is skipped while local mutations are still
pending so unsent local edits are not overwritten.

Required production work:

- Add realtime or periodic foreground refresh after the initial sync pass.
- Add richer conflict resolution beyond deterministic last-write-wins.
- Require authenticated `ownerId` plus RLS before production use.

### Resolved: Web storage is persistent for app data

Web templates that request `sqlite` now use localStorage-backed app data persistence instead of the
memory fallback.

Required production work:

- Replace localStorage with an IndexedDB-backed repository before large web datasets.
- Keep the same `CrudRepository` interface so renderer code remains platform-neutral.
- Reuse the native JSON-row storage shape to keep sync behavior consistent across web and mobile.

### P2: Large datasets will block and over-render

The repository API is synchronous and `getRecords(tableName)` loads the full table. Datasource
filtering and sorting then happen in JavaScript. This is acceptable for small mini-app datasets, but
large vendor, expense, or CRM-style apps need paging and query pushdown.

Required production work:

- Add paged `queryRecords` support with filter/sort/limit arguments.
- Push SQLite filtering and sorting into SQL where possible.
- Add indexes or sidecar metadata for frequently filtered fields.

### P2: Data validation is incomplete at write time

The dispatcher coerces common field types and drops unknown fields, but required-field validation,
field-specific validation errors, and user-facing save errors are not implemented yet.

Required production work:

- Validate `required`, field type, and picklist/multiselect membership before create/update.
- Return action errors into runtime state instead of using alerts/logs only.
- Keep invalid drafts open and show field-level errors.

## Fixes Made During Review

- Generated record IDs now always win on create. A malicious or accidental template field named `id`
  can no longer override locally generated IDs.
- In-memory updates now preserve the original record ID even if a patch contains `id`.
- Action writes now sanitize values to declared table fields only. Unknown draft keys are dropped
  before create/update.
- Action writes now coerce common field types before persistence and sync:
  `number`, `decimal`, `percentage`, and `currency` become numbers; `boolean` becomes boolean;
  `multiselect` becomes a string array; scalar values become strings for text-like fields.
- SQLite JSON parsing now catches corrupt row payloads and returns an empty record body instead of
  crashing the full list read.
- Supabase sync now uses a durable outbox, retry/backoff, two-way pull by watermark, tombstones, and
  runtime sync status.
- Web `sqlite` apps now persist records locally through localStorage instead of falling back to memory.

## SQLite Review

Strengths:

- The native SQLite implementation isolates app/table data with physical table names derived from
  `appId` and logical `tableName`.
- Records are stored as `id` plus JSON `data`, which keeps templates flexible as fields evolve.
- Seed data is inserted only when a table is empty, preventing repeated seed duplication.
- All SQL table identifiers are derived through a sanitizer, and row values use parameter binding.

Risks and gaps:

- The API is synchronous. For small local-first apps this is acceptable, but large tables or complex
  reads can block UI work.
- There is no query pushdown for datasource filters or sorts; every `getRecords` reads the whole table
  and filters in JavaScript.
- There is no schema migration/version table. JSON storage reduces migration pressure, but app-level
  data migrations will still be needed as templates evolve.
- Web uses localStorage rather than SQLite/IndexedDB today. This preserves records across refreshes,
  but it is not the right long-term storage engine for large browser datasets.
- Corrupt JSON rows are tolerated after this review, but they are not repaired or quarantined.

Recommended next steps:

- Add paged repository reads before enabling large lists.
- Add indexed metadata columns for common query fields or a sidecar index table if local datasets grow.
- Add an app data schema version table and a migration hook per template.
- Add an IndexedDB-backed web repository for large web datasets and better storage quotas.

## Supabase Sync Review

Strengths:

- Sync is opt-in through host config and does not block local writes.
- The generic `ministore_records` table shape can support many app templates without per-template
  Supabase schema changes.
- Deletes are represented as tombstones via `deleted_at`, which is compatible with future pull sync.
- The implementation does not embed credentials in templates.
- Pending local mutations survive app restarts and are retried with exponential backoff.
- Pull sync applies remote upserts and tombstones after local pending changes have flushed.

Risks and gaps:

- Background sync while the app is inactive is not implemented.
- Conflict handling is deterministic last-write-wins by `updated_at`; there is no field-level merge.
- Supabase row-level security must be configured by the user's Supabase project before production use.
- The wrapper assumes a Supabase unique constraint on `(owner_id, app_id, table_name, record_id)` for
  upsert.
- If Supabase rejects a row, local state remains ahead of remote until the queued outbox item is
  retried or manually resolved.

Recommended next steps:

- Add app lifecycle hooks to run sync when the app foregrounds and when network connectivity returns.
- Add richer conflict resolution for field types that need merge semantics.
- Add a hosted Supabase setup screen or wizard that checks table/RLS readiness.
- Add integration tests with a mock Supabase REST endpoint before relying on live cloud sync.

## Action Dispatcher Review

Strengths:

- Actions remain declarative; downloaded templates cannot execute arbitrary JavaScript.
- CRUD operations are gated by the declared operation permissions in the app definition.
- Modal create/update flows share one repository path.

Risks and gaps:

- Required fields are not enforced before create/update.
- Type coercion is now present, but validation errors are not displayed in forms.
- There is no transactional action chain. If a future action sequence mutates multiple tables, partial
  success is possible.

Recommended next steps:

- Add form validation from `required` and field type metadata before dispatching writes.
- Return action results and errors through runtime state instead of relying only on alerts/logs.
- Add repository transaction support before multi-table actions are introduced.

## Installed Template Persistence Review

Strengths:

- Web and native persistence use platform-appropriate local stores.
- Installed payloads are revalidated through the same catalog parser before entering the runtime.
- Installed templates are merged by `appId`, so updates replace older copies.

Risks and gaps:

- There is no uninstall flow.
- Installed templates retain arbitrary seed data size; large downloads can fill local storage.
- There is no signature, checksum, or trusted publisher metadata for public templates.

Recommended next steps:

- Add uninstall/update actions in settings.
- Add size limits and display download metadata before installing.
- Add optional manifest signatures or checksums for trusted template catalogs.

## Overall Assessment

The data layer is suitable for a local-first MVP with small to moderate datasets. SQLite CRUD is
simple and predictable on native, and Supabase sync is correctly positioned as an optional mirror
rather than a blocking dependency. The main production blockers are durable sync retry, pull/conflict
handling, validation UX, and web persistence parity.
