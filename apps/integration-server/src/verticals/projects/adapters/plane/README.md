# Plane adapter

Plane Cloud REST API v1 → canonical projects schema.

OAuth2 (authorization code) + REST. `PLANE_CLIENT_ID` / `PLANE_CLIENT_SECRET`. Access token sent as `Authorization: Bearer <token>`. Base URL `https://api.plane.so/api/v1`.

Webhook: HMAC-SHA256 of the raw body in `X-Plane-Signature` (hex). Per-webhook secret generated at registration.

## Model notes

- Everything is rooted at `/workspaces/{slug}/...`. The workspace slug is captured at OAuth time in `credentials.extra.workspaceSlug` (overridable per-call via `params.workspace_slug`).
- Work items (Plane "issues") are the task model. Canonical status is derived from the work item's state `group` (backlog/unstarted/started/completed/cancelled), resolved from the project's states. Subtasks → `Task.parentId` (Plane `parent`).
- Labels are PROJECT-scoped → canonical `Tag`. `listTags` needs `params.project_id`.
- Get-by-id paths take slash-joined composite ids: `getTask` → `projectId/workItemId`, `getComment` → `projectId/workItemId/commentId`, `getTag` → `projectId/labelId`.

## Not implemented (auto-501)

- `listWorkspaces` / `getWorkspace` — no standalone workspace object in the v1 REST API.

Refused: attachment content, time-tracking, user PII beyond name+email.
