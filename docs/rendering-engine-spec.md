# Dynamic App Rendering Engine — Architecture & Spec (v0.1)
### For handoff to Codex | React Native + Expo | Kitchen Sink PoC + ToDo reference app

---

## 0. What this document covers

1. Design principles the engine must follow
2. Component taxonomy (primitives → complex → containers → dashboard widgets)
3. The App Definition schema (the JSON "config" every app is built from)
4. Data model / field types (grounded in the real Zoho Creator `CRM.ds` you use today)
5. Rendering engine architecture for React Native + Expo
6. Tech stack decisions, with rationale
7. Repo structure
8. Kitchen Sink app — screen-by-screen plan
9. ToDo app — full worked example (complete JSON)
10. Build plan / milestones for Codex
11. Open decisions flagged back to Shyam

This spec assumes **no code generation**. Every app is data (a JSON definition) interpreted by one
shared renderer. That is the entire point of the architecture — it is what makes this cheap to run,
safe to run untrusted output in, and easy to port to web later.

---

## 1. Design principles

- **Schema in, UI out.** The renderer is a pure function of `(AppDefinition, DataState) → UI`. It never
  executes generated code. AI's job later is to *produce/edit the JSON*, not write JSX.
- **One renderer, many apps.** Every mini-app (CRM, ToDo, expense tracker, calculator) is the same
  binary running a different JSON file. New app = new JSON, not a new build.
- **Component registry, not a switch statement.** Every component type is registered once
  (`type → React component`) so adding a new component type is additive, never a rewrite of the
  renderer core.
- **Data and UI are separate layers.** The schema describes *tables/fields* (data model) and
  *pages/layout* (presentation) as two distinct sections that reference each other by name — this
  mirrors Zoho Creator's own `forms` (data) vs `pages` (ZML layout) split, which is a proven pattern,
  not something we need to redesign.
- **Everything a component needs is declared, not coded**: data source, field bindings, visibility
  conditions, actions on interaction. No inline scripting in v0.1 — add a constrained expression
  language later if needed (Zoho's own formula syntax is a reasonable model to copy from).
- **Local-first.** v0.1 has no backend. Data lives in local device storage. The schema format should
  not assume a server exists.
- **Sandboxed by construction.** Because there is no generated code execution, a malformed or malicious
  JSON definition can, at worst, describe a broken UI — it cannot access anything outside the
  whitelisted component/data API surface. Keep it this way; resist adding an "eval this JS snippet"
  escape hatch to the schema even under pressure to unblock an edge case.

---

## 2. Component taxonomy

Cross-referenced against **shadcn/ui** (web primitives — good source for the *interaction/variant*
vocabulary) and **Ionic** (mobile-native component set — good source for what actually needs to exist
on a phone: action sheets, segments, native-feeling lists). Grouped into four tiers, matching how the
schema will categorize `component.kind`.

### 2.1 Primitives (`kind: "primitive"`)
| Component | Notes |
|---|---|
| `text` | Static or bound text, variants: heading/body/caption/label |
| `input` | Text/number/email/phone/password/multiline — maps to Zoho's `text/textarea/email/phonenumber/number` |
| `button` | Variants: filled/outline/ghost/destructive — maps to Zoho's `submit/reset/cancel` action buttons |
| `icon` | From a fixed icon set (e.g. lucide via `lucide-react-native`) |
| `image` | Static or bound to a field/URL |
| `checkbox` | Single boolean |
| `radiogroup` | Single-select from fixed options — Zoho `radiobuttons` |
| `checkboxgroup` | Multi-select from fixed options — Zoho `checkboxes` |
| `switch` | Boolean toggle, iOS/Android native look |
| `select` / `picker` | Single-select dropdown — Zoho `picklist` (static values) |
| `lookupselect` | Single-select sourced from another table's records — Zoho `picklist` bound to `Master.ID` |
| `datepicker` | Date only |
| `datetimepicker` | Date + time — Zoho `datetime` |
| `slider` | Numeric range |
| `badge` / `chip` | Status/tag display, often bound to a picklist field's value |
| `avatar` | Image or initials |
| `divider` | Visual separator |
| `progressbar` | Bound to a numeric/percentage field |

### 2.2 Complex components (`kind: "complex"`)
| Component | Notes |
|---|---|
| `tabs` | Segmented views, each with its own child layout |
| `accordion` | Collapsible sections |
| `stepper` / `wizard` | Multi-step form flow |
| `searchbar` | Filters a bound `datasource` — Zoho's `search` element |
| `modal` / `bottomsheet` | Overlay containers, triggered by an action |
| `actionsheet` | Ionic-style contextual action menu |
| `toast` / `snackbar` | Transient feedback, triggered by an action |
| `calendarview` | Month/week/agenda view of records with a date field — Zoho `My_Open_Deals_Calendar` pattern |
| `fileupload` | Zoho `upload file` |
| `signaturepad` | Common in field-ops templates (delivery, service tickets) — not in Zoho config but flagged as needed for template list from earlier |
| `ratingstars` | For feedback/review templates |
| `formsection` | A titled/collapsible group of fields — Zoho `section` |
| `compoundfield` | Multi-part field (Zoho `name` = prefix/first/last/suffix) |

### 2.3 Container / layout components (`kind: "container"`)
| Component | Notes |
|---|---|
| `screen` | Top-level page container |
| `stack` | Vertical or horizontal flex layout (replaces Zoho's `row`/`column` ZML nesting) |
| `grid` | Fixed-column responsive grid |
| `card` | Bordered/elevated content block |
| `list` | Record list bound to a `datasource`, each row rendered from a `cardTemplate` — Zoho `report` (list view) |
| `table` | Dense tabular record view with sortable columns — Zoho `report` (grid view) |
| `kanban` | Column-per-status board, drag between columns — needed for the task-board / deal-stage templates (Zoho's `Deals_by_Stage` report is the data-side equivalent) |
| `mapview` | Pin/marker list from a `datasource` with lat/lng fields, OpenStreetMap tiles |
| `scrollview` | Generic scrollable wrapper |
| `panel` | Zoho's `panel` — a styled content box, usually inside a dashboard page |

### 2.4 Dashboard / data-viz widgets (`kind: "widget"`)
| Component | Notes |
|---|---|
| `statcard` | Single KPI number + label + optional trend arrow |
| `piechart` | Bound to a grouped aggregation of a datasource |
| `barchart` | Vertical/horizontal |
| `linechart` | Time-series |
| `donutchart` | Variant of pie |
| `progressring` | Circular KPI |

All widgets take the same shape of input: `{ datasource, groupBy?, aggregate: {field, fn: sum|count|avg}, series }` — one aggregation contract for every chart type, so the renderer only needs one data-prep utility, not one per chart.

---

## 3. The App Definition schema

Top-level shape. This is the JSON "config" — the direct equivalent of the `.ds` file you attached, translated to JSON and modernized.

```json
{
  "appId": "string",
  "name": "string",
  "version": "1.0.0",
  "theme": { "primaryColor": "#2193B0", "radius": "md", "fontScale": 1.0 },
  "tables": [ /* data model — see §4 */ ],
  "pages": [ /* UI — see below */ ],
  "navigation": {
    "type": "tabs | drawer | stack",
    "items": [ { "pageId": "string", "label": "string", "icon": "string" } ]
  }
}
```

### 3.1 Page definition
```json
{
  "pageId": "todo_list",
  "title": "My Tasks",
  "layout": {
    "kind": "container",
    "type": "screen",
    "children": [
      {
        "kind": "container",
        "type": "list",
        "id": "task_list",
        "datasource": { "table": "Tasks", "sort": [{ "field": "due_date", "dir": "asc" }],
                        "filter": { "field": "completed", "op": "eq", "value": false } },
        "itemTemplate": {
          "kind": "container", "type": "card",
          "children": [
            { "kind": "primitive", "type": "checkbox", "bind": "completed", "onChange": "toggleComplete" },
            { "kind": "primitive", "type": "text", "bind": "title", "variant": "body" },
            { "kind": "primitive", "type": "badge", "bind": "priority" }
          ]
        }
      },
      {
        "kind": "primitive", "type": "button", "label": "+ Add Task",
        "action": { "type": "openModal", "target": "add_task_modal" }
      }
    ]
  }
}
```

### 3.2 Binding & action model
- **`bind`**: a field name on the page's active record/datasource context. Renderer resolves it to a
  live value and (for inputs) a two-way setter.
- **`action`**: a declarative verb, not code. v0.1 action set:
  `createRecord`, `updateRecord`, `deleteRecord`, `openModal`, `closeModal`, `navigate`,
  `toggleField`, `showToast`. Each action takes a fixed set of named parameters — no arbitrary
  expressions in v0.1 (see §11 on when/if to add a formula language).
- **`visibility`** (optional, on any component): `{ "field": "status", "op": "eq", "value": "Won" }`
  — directly mirrors Zoho's field-level `visibility` conditions.

This binding model is intentionally close to what's already in `CRM.ds` (`criteriaString`, `values =
Product_Master.ID`, `visibility = true`) — you're not inventing a new mental model, you're
JSON-ifying one your own team has already used in production for years.

---

## 4. Data model / field types

Pulled directly from the field `type=` values actually present in `CRM.ds`, normalized into a single
list. This is your v0.1 field type set — comprehensive enough for the first 50 templates without
needing extension.

| Schema field type | Storage | Renders as (default) | Zoho source |
|---|---|---|---|
| `text` | string | `input` | `text` |
| `textarea` | string | `input` (multiline) | `textarea` |
| `number` | number | `input` (numeric) | `number` |
| `decimal` | number | `input` (numeric) | `decimal` |
| `percentage` | number | `input` + `%` suffix | `percentage` |
| `currency` | number | `input` + currency symbol | `INR`/currency type |
| `email` | string | `input` (email keyboard) | `email` |
| `phone` | string | `input` (phone keyboard) | `phonenumber` |
| `url` | string | `input` | `url` |
| `date` | ISO date | `datepicker` | `date` |
| `datetime` | ISO datetime | `datetimepicker` | `datetime` |
| `boolean` | bool | `checkbox` / `switch` | `checkbox` |
| `picklist` | string | `select` | `picklist` (static values) |
| `lookup` | recordId | `lookupselect` | `picklist` (`values = Table.ID`) |
| `multiselect` | string[] | `checkboxgroup` | `checkboxes` |
| `singlechoice` | string | `radiogroup` | `radiobuttons` |
| `compound_name` | `{prefix,first,last,suffix}` | `compoundfield` | `name` |
| `image` | file ref | `image` + upload control | `image` |
| `file` | file ref | `fileupload` | `upload file` |
| `formula` | computed, read-only | `text` (computed) | `formula` |
| `autonumber` | int, system-assigned | `text` (read-only) | `autonumber` |
| `geopoint` | `{lat, lng}` | consumed by `mapview` | *(new — not in Zoho config, needed for map templates)* |

`formula` in v0.1 supports only a small fixed set of computed patterns (concatenation, sum of two
fields, simple date math) evaluated by the renderer — not an arbitrary expression evaluator. Expand
later if templates need it (see §11).

### Table definition shape
```json
{
  "tableName": "Tasks",
  "fields": [
    { "name": "title", "type": "text", "required": true },
    { "name": "due_date", "type": "date" },
    { "name": "priority", "type": "picklist", "values": ["Low", "Medium", "High"] },
    { "name": "completed", "type": "boolean", "default": false }
  ]
}
```

---

## 5. Rendering engine architecture (React Native + Expo)

```
AppDefinition (JSON)
        │
        ▼
 ┌─────────────────┐
 │  Schema Loader    │  validates JSON against a Zod schema, fails loudly on bad config
 └─────────────────┘
        │
        ▼
 ┌─────────────────┐        ┌──────────────────────┐
 │  Data Layer       │◄──────►  Local Store (SQLite)  │
 │  (per-table CRUD, │        │  one table per         │
 │  reactive queries)│        │  AppDefinition.table   │
 └─────────────────┘        └──────────────────────┘
        │
        ▼
 ┌─────────────────┐
 │  Renderer core    │  walks layout tree recursively
 │  <Node definition │  resolves `bind` via Data Layer + local component state
 │   {kind,type,...}>│  resolves `visibility` conditions
 └─────────────────┘
        │
        ▼
 ┌─────────────────┐
 │ Component Registry │  Map<string, ComponentImpl>
 │  "primitive.button" │  registered once at app boot; renderer looks up
 │  "container.list"   │  `${kind}.${type}` and hands it (props, children, ctx)
 │  "widget.piechart"  │
 └─────────────────┘
        │
        ▼
 ┌─────────────────┐
 │  Action Dispatcher │  interprets declarative `action` objects
 │  createRecord/     │  against the Data Layer + Navigation
 │  navigate/etc.     │
 └─────────────────┘
```

### Key architectural decisions
- **`<Node>` is the only recursive renderer component.** It takes a JSON node, looks up
  `${kind}.${type}` in the registry, resolves bindings from context, and renders the registered
  component, passing `children` (already-recursed `<Node>` elements) as needed. There is no per-app-type
  renderer — the same `<Node>` renders a CRM, a ToDo app, and the Kitchen Sink screen identically.
- **Context, not prop-drilling, for data.** A `DataSourceProvider` (React Context) exposes the active
  table's records/record to any descendant `<Node>` — mirrors how Zoho's ZML pages implicitly know
  which `report`/`form` they're bound to.
- **Local store: SQLite via `expo-sqlite` (or `op-sqlite` if performance requires it later), wrapped
  by a small repository layer** (`getRecords`, `createRecord`, `updateRecord`, `deleteRecord`,
  `subscribeToTable`). This repository is the seam where a future Supabase sync adapter plugs in
  without the renderer or schema changing — the renderer never talks to SQLite directly.
- **Validation at load time, not render time.** Parse the whole `AppDefinition` through a schema
  validator (Zod) once, on load — catch bad configs before any component tries to render, with a
  clear error screen naming the offending node.

---

## 6. Tech stack decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | **Expo (React Native), SDK current stable, TypeScript** | as specified |
| Base component kit | **Tamagui** or **gluestack-ui** (pick one — see §11) over React Native Paper | Both give you a themeable, shadcn-adjacent primitive set (Box/Stack/Text/Button with variants) that's a much closer match to shadcn's design-token approach than Paper's Material-only look — and both work in Expo without ejecting. |
| Icons | `lucide-react-native` | Same icon set as shadcn, consistent look if a web renderer is added later |
| Charts | `react-native-gifted-charts` (or `victory-native` as fallback) | Actively maintained, covers pie/bar/line/donut in one lib, good Expo compatibility |
| Maps (OpenStreetMap) | **`@maplibre/maplibre-react-native`** with an OSM/MapTiler-hosted style, via an Expo **dev client / prebuild** (not Expo Go — MapLibre requires native modules) | Confirmed current (2026) recommended path for OSM-based maps in Expo; `react-native-maps` does not cleanly support OSM tiles on iOS. Requires a custom dev client, flag this to Codex early since it changes the "just run Expo Go" workflow. |
| Local data | `expo-sqlite` + a thin repository layer | Structured, queryable, matches the relational table model in §4; easy migration path to Supabase (same relational shape) |
| Forms/validation | `react-hook-form` + `zod` internally in the input primitives, not exposed in the schema | Keeps per-field validation robust without pushing validation logic into the JSON schema |
| Navigation | `expo-router` or `@react-navigation` driven by `AppDefinition.navigation` | Renderer generates the tab/stack structure from the schema's nav block |

---

## 7. Repo structure

```
/app-renderer
  /schema
    appDefinition.schema.ts     # Zod schema + TS types for the whole config
    fieldTypes.ts
  /registry
    index.ts                    # kind.type -> component map, registered at boot
    primitives/ (Text, Input, Button, Checkbox, Select, ...)
    complex/ (Tabs, Modal, CalendarView, ...)
    containers/ (Stack, List, Table, Kanban, MapView, Card, ...)
    widgets/ (PieChart, BarChart, LineChart, StatCard, ...)
  /renderer
    Node.tsx                    # the single recursive renderer
    DataSourceProvider.tsx
    ActionDispatcher.ts
    bindings.ts                 # resolves `bind`/`visibility` against context
  /data
    db.ts                       # expo-sqlite setup
    repository.ts               # getRecords/createRecord/... generic CRUD
  /apps                         # AppDefinition JSON files, one per mini-app
    kitchensink.json
    todo.json
  /navigation
    buildNavigator.ts           # turns AppDefinition.navigation into a navigator
  App.tsx                       # loads an AppDefinition (via a picker for PoC), boots renderer
```

---

## 8. Kitchen Sink app — screen plan

One tab per component tier from §2, each screen a `list`/`stack` of live, interactive instances with
visible labels, so every registered component can be visually verified on an Android phone in one
pass.

1. **Primitives** — every row: label + live component (input, button variants, switch, slider, chip,
   picker, date picker, radio group, checkbox group, compound name field, progress bar)
2. **Complex** — tabs-in-tabs demo, accordion, stepper (3-step dummy form), modal + bottom sheet
   triggers, toast trigger, searchbar over a dummy dataset, file upload, signature pad, star rating
3. **Containers** — card, list (bound to a seeded `Demo_Records` table), table view of the same data,
   kanban board (3 columns, drag between them), map view (a few pinned demo locations via MapLibre/OSM
   tiles)
4. **Dashboard widgets** — stat card row, pie/bar/line/donut chart all bound to the same seeded
   aggregation, so the "one aggregation contract" from §2.4 is visibly proven

Seed data: a `Demo_Records` table (10-15 rows, fields spanning most of the §4 type list) shared across
the List/Table/Kanban/Map/Charts screens so the PoC also proves one dataset can drive every container
and widget type.

---

## 9. ToDo app — full worked example

`tables`:
```json
[{
  "tableName": "Tasks",
  "fields": [
    { "name": "title", "type": "text", "required": true },
    { "name": "notes", "type": "textarea" },
    { "name": "due_date", "type": "date" },
    { "name": "priority", "type": "picklist", "values": ["Low", "Medium", "High"], "default": "Medium" },
    { "name": "completed", "type": "boolean", "default": false }
  ]
}]
```

`pages` — two pages: list (home) + add-task modal.

```json
[
  {
    "pageId": "task_list",
    "title": "My Tasks",
    "layout": {
      "kind": "container", "type": "screen",
      "children": [
        {
          "kind": "container", "type": "list", "id": "open_tasks",
          "datasource": { "table": "Tasks", "filter": { "field": "completed", "op": "eq", "value": false },
                          "sort": [{ "field": "due_date", "dir": "asc" }] },
          "emptyState": { "kind": "primitive", "type": "text", "value": "No tasks yet — add one below." },
          "itemTemplate": {
            "kind": "container", "type": "card",
            "children": [
              { "kind": "primitive", "type": "checkbox", "bind": "completed",
                "action": { "type": "updateRecord", "table": "Tasks", "field": "completed", "value": true } },
              { "kind": "container", "type": "stack", "direction": "vertical",
                "children": [
                  { "kind": "primitive", "type": "text", "bind": "title", "variant": "body" },
                  { "kind": "primitive", "type": "text", "bind": "due_date", "variant": "caption" }
                ]
              },
              { "kind": "primitive", "type": "badge", "bind": "priority" }
            ]
          }
        },
        {
          "kind": "primitive", "type": "button", "label": "+ Add Task", "variant": "filled",
          "action": { "type": "openModal", "target": "add_task_modal" }
        }
      ]
    }
  },
  {
    "pageId": "add_task_modal",
    "title": "New Task",
    "layout": {
      "kind": "complex", "type": "modal",
      "children": [
        { "kind": "primitive", "type": "input", "bind": "title", "label": "Title", "required": true },
        { "kind": "primitive", "type": "input", "bind": "notes", "label": "Notes", "multiline": true },
        { "kind": "primitive", "type": "datepicker", "bind": "due_date", "label": "Due Date" },
        { "kind": "primitive", "type": "select", "bind": "priority", "label": "Priority" },
        { "kind": "primitive", "type": "button", "label": "Save", "variant": "filled",
          "action": { "type": "createRecord", "table": "Tasks", "onSuccess": { "type": "closeModal" } } },
        { "kind": "primitive", "type": "button", "label": "Cancel", "variant": "ghost",
          "action": { "type": "closeModal" } }
      ]
    }
  }
]
```

`navigation`:
```json
{ "type": "stack", "items": [{ "pageId": "task_list", "label": "Tasks", "icon": "check-square" }] }
```

This one file, run through the same renderer as the Kitchen Sink, is a complete working ToDo app —
proving the "one engine, many apps" claim concretely before any AI generation is wired in.

---

## 10. Build plan / milestones for Codex

1. **Schema + validator** — write the Zod schema for `AppDefinition` (§3-4), with clear parse errors.
2. **Data layer** — `expo-sqlite` repository (CRUD + reactive subscribe), seed script for `Demo_Records`.
3. **Registry + Node renderer** — wire up primitives first (§2.1), get the ToDo app's list+modal
   rendering end to end before touching complex/container/widget tiers.
4. **Containers** — list, card, table, then kanban and mapview (mapview last — it's the only tier
   needing a custom dev client build, don't let it block everything else).
5. **Complex components** — tabs, modal, calendar view, searchbar.
6. **Dashboard widgets** — stat card, then the four chart types against the shared aggregation
   contract.
7. **Kitchen Sink app** — assemble the four screens from §8 once each tier above is working.
8. **ToDo app** — should mostly "just work" once step 3-4 land, since it only uses list/card/modal/
   input primitives — treat it as the integration test, not a separate build.
9. **Navigation** — wire `AppDefinition.navigation` to a real tab/stack navigator once there are 2+ apps
   to switch between in the PoC shell.

Steps 1-3 are the critical path — everything else is additive once the registry pattern is proven.

---

## 11. Open decisions flagged back to Shyam

- **Tamagui vs gluestack-ui** for the base kit — both fit; worth a half-day spike comparing Expo
  build times and theming ergonomics before committing, since every primitive component wraps this
  choice.
- **MapLibre requires a custom dev client**, not Expo Go — confirm you're OK with that workflow change
  for the PoC (it's a one-time setup cost, not ongoing friction).
- **Formula/expression language**: v0.1 deliberately has no scripting in the schema (fixed action verbs
  + a small fixed formula-pattern set). This will be too limited once templates need real conditional
  logic (e.g. "auto-set priority High if due_date is within 2 days"). Decide before scaling past the
  first 10 templates whether to add a small sandboxed expression language (JSONLogic is a proven, safe
  choice here) rather than let it get added ad-hoc.
- **Kanban drag-and-drop and signature pad** are the two components with no direct Zoho precedent and
  real native-gesture complexity — budget them separately, don't assume they're same-effort as the rest
  of the table.
