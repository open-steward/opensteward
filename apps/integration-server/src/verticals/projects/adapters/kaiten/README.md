# Kaiten adapter

Kaiten REST API (`/api/latest`) → canonical projects schema.

API-key auth. Token stored as `credentials.accessToken`; company base URL stored in `credentials.extra.baseUrl`.

Webhooks: Kaiten supports external webhooks (card:add, card:update, comment:add, …) but does not document a signature-verification scheme. `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Model notes

- Space → Workspace.
- Board → Project (boards live inside a space; `workspace_id` selects the space and reads `GET /spaces/{id}/boards`; without it, boards are flattened out of the paged `GET /spaces` list, each space carrying its `boards`). Status comes from the parent space's `archived` flag.
- Card → Task. State 3 (done) maps to `closed`; states 1/2 map to `open`.
- Subtasks: `parents_ids[0]` → `Task.parentId`; `children_count` → `Task.subtaskCount`.
- Card members + owner → `Task.assigneeIds`.
- Card comment → canonical `Comment`. Deleted comments filtered out.
- Tags are company-wide (no per-space scope); `workspaceId` left empty.
- Users are company-wide; `workspaceIds` left empty.

Refused: attachment content, time-tracking, user PII beyond name+email.
