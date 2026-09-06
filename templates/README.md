# AppFoundry Template Catalog

AppFoundry loads installable app templates from the configured public JSON catalog.

Catalog shape:

```json
{
  "version": 1,
  "templates": [
    {
      "id": "inventory-lite",
      "appId": "inventory-lite",
      "name": "Inventory Lite",
      "icon": "package",
      "description": "Track products, stock movements, and low-stock follow-ups.",
      "url": "https://raw.githubusercontent.com/gigcompany/appfoundry-templates/main/apps/inventory-lite.json",
      "tags": ["inventory", "operations"]
    }
  ]
}
```

Each `url` must point to an AppFoundry template JSON payload. GitHub `blob` URLs are converted to `raw.githubusercontent.com` before download.

## Template Logic

Templates can include declarative logic rules. AppFoundry does not execute arbitrary JavaScript from
downloaded templates; it only runs whitelisted rule steps.

Supported events:

- `preLoad`
- `postLoad`
- `fieldChange`
- `validation`
- `preSubmission`
- `postSubmission`
- `buttonClick`

Rules can be app-wide in `app.logic`, or attached to any node with `node.logic`. Node logic is scoped
to that node when the node has an `id`.

Example:

```json
{
  "logic": [
    {
      "id": "default-task-priority",
      "event": "preLoad",
      "pageId": "add_task_modal",
      "steps": [
        { "type": "setField", "field": "priority", "value": "Medium" }
      ]
    },
    {
      "id": "title-required",
      "event": "validation",
      "table": "Tasks",
      "steps": [
        { "type": "validate", "field": "title", "message": "Title is required." }
      ]
    },
    {
      "id": "large-expense-check",
      "event": "preSubmission",
      "table": "Expenses",
      "steps": [
        {
          "type": "stop",
          "message": "Expenses over 5000 need approval.",
          "when": { "field": "amount", "op": "gt", "value": 5000 }
        }
      ]
    }
  ]
}
```

Available step types:

- `setField`: writes a value into the current form draft.
- `showToast`: displays a short message.
- `validate`: blocks the current submission when the field is empty, or when its `when` condition is false.
- `stop`: blocks the current action/submission when its optional `when` condition matches.
- `runAction`: queues an existing whitelisted AppFoundry action such as `navigate`, `openModal`, or `closeModal`.

Conditions support `eq`, `neq`, `contains`, `empty`, `notEmpty`, `gt`, `gte`, `lt`, `lte`, and `in`.
Values can be literals or references:

```json
{ "source": "draft", "field": "amount" }
{ "source": "record", "field": "status" }
{ "source": "event", "key": "value" }
{ "source": "now" }
```
