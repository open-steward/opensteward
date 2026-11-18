# Meisterplan adapter

Meisterplan REST API → canonical projects schema.

Auth: long-lived API token (`Authorization: api-<token>`). Token + optional region (`us` | `eu`) collected via Connect Link custom form.

Docs: https://api.us.meisterplan.com/docs/api.html

## Model mapping

| Meisterplan resource        | Canonical resource |
| --------------------------- | ------------------ |
| Scenario                    | Workspace          |
| Project                     | Project            |
| Resource (person)           | User               |
| Role                        | Tag                |
| Task (task-management link) | Task               |

## Not implemented

- **Comment** — no comment resource in the public API. Auto-responds 501.

## Pagination

Cursor-based: `pageSize` + `pageAfter` query params. Response carries `_pagination.after.cursor` for the next page.

## Scenario scoping

Project calls are scoped to a scenario ID. The adapter defaults to the Plan of Record sentinel (`PLAN_OF_RECORD_ID`) when no explicit `workspace_id` / `scenario_id` is provided.
