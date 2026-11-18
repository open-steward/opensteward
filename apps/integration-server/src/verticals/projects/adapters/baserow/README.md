# Baserow adapter

Baserow REST API → canonical projects schema.

Auth: personal API token (long-lived database token) via `Authorization: Token <key>`.

## Canonical mapping

| Canonical | Baserow resource | Endpoint |
|-----------|-----------------|----------|
| Workspace | workspace | `GET /api/workspaces/` |
| Project   | application (database) | `GET /api/applications/` |
| Task      | row | `GET /api/database/rows/table/{table_id}/` |
| User      | workspace member (embedded) | `GET /api/workspaces/` |

## Not implemented

- **Comments** — Baserow has no comment/discussion REST API.
- **Tags** — no label/tag system in the REST API.
- **Webhooks** — Baserow webhooks carry no HMAC signature; verification is not documented.

## Notes

- `getTask` requires a composite id of the form `{tableId}:{rowId}` because Baserow's row GET endpoint is scoped under the table path.
- Rows are mapped to Tasks using the table id as the `projectId`. The first field (`field_1`) is used as the row title when present.
- Dynamic field values (`field_*`) are surfaced in `metadata` and `raw`.
