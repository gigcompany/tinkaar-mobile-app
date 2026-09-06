# Rendering Engine Review

## Scope

Reviewed the schema, registry, runtime context, action dispatcher, local repositories, template catalog,
and launcher flow as of this implementation pass.

## Current Coverage

- Primitives: `text`, `input`, `button`, `checkbox`, `switch`, `radiogroup`, `checkboxgroup`,
  `datepicker`, `select`, `badge`, `divider`, and `progressbar`.
- Containers: `screen`, `stack`, `grid`, `card`, `list`, and `table`.
- Complex shells: `modal`.
- Widgets: `statcard`, `category-breakdown`, and `timeline`.
- Actions: `createRecord`, `updateRecord`, `deleteRecord`, `openModal`, `closeModal`, `navigate`,
  `toggleField`, and `showToast`.

## Changes Made From Review

- Registry entries now render as React components instead of direct function calls. This keeps hook
  behavior valid and makes memoized renderer nodes predictable.
- `RendererNode` is memoized and memoizes recursive child node rendering for stable app definitions.
- Checkbox-bound modal fields now update draft state when they do not have an explicit action.
- Added missing schema/registry support for table columns and several primitives already implied by
  the field taxonomy.
- Lists and widgets continue to use datasource filtering/sorting through one shared data path.

## Performance Notes

- The current renderer is efficient enough for small operational mini apps because each app definition
  is static, repositories notify through a single version counter, and records are read synchronously
  from local memory or SQLite.
- Large record lists will need virtualization before production-scale datasets. The current `list`
  component maps all records into cards inside a `ScrollView`.
- Derived widget values currently recompute on render. That is acceptable for small templates, but
  grouped aggregations should move behind memoized selectors if dashboards grow.
- The schema remains data-only. No downloaded template executes code, which keeps rendering bounded by
  the registry surface.

## Remaining Gaps

- Advanced controls still missing: lookup selects, searchbar-driven list filtering, tabs, accordions,
  calendars, kanban, file upload, image/avatar, and map views.
- Validation is structural. Cross-reference validation should be added for missing page IDs, table
  names, field names, and invalid action targets before untrusted template installation is considered
  production-ready.
- Cloud sync is mutation mirroring only. Conflict resolution, pull sync, auth/session binding, retry
  queues, and per-user row policies are still needed for production Supabase deployments.
