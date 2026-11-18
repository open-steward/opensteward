# SeaTable adapter

SeaTable REST API → canonical projects schema.

Auth: static tokens (no OAuth), `Authorization: Bearer`. The required base
API-Token is exchanged for a Base-Token (rows, comments, collaborators). The
optional Account-Token authenticates the account operations (list workspaces,
list bases); without it those refuse with 501 NOT_SUPPORTED.

Webhook: HMAC-SHA256 in `X-SeaTable-Signature` (hex), signed with the secret key
configured at webhook creation. Payload `data.op_type` maps to canonical actions.

## Model mapping

| Canonical | SeaTable |
|-----------|----------|
| Workspace | Workspace (`/api/v2.1/workspaces/`) |
| Project   | Base/DTable (in workspace `table_list`) |
| Task      | Row (`/api-gateway/api/v2/dtables/{uuid}/rows/`) |
| Comment   | Row comment (`/api-gateway/api/v2/dtables/{uuid}/comments/`) |
| User      | Collaborator (`/api-gateway/api/v2/dtables/{uuid}/related-users/`) |
| Tag       | Not supported (auto-501) |

## Notes

- Task fields (title, status, priority, assignee, due date) are mapped via
  case-insensitive column name lookup against common column names.
- `listTasks` requires `params.table_name` (default: `Table1`).
- `listComments` requires `params.project_id` = base_uuid.
- `listUsers(workspaceId)` expects workspaceId to be the base_uuid.

Refused: attachment content, time-tracking, user PII beyond name+email.
