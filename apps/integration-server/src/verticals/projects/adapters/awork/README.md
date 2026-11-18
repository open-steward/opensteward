# awork adapter

awork REST API v1 (`https://api.awork.com/api/v1`) → canonical projects schema.

OAuth2 (authorization-code, confidential client) + REST. `AWORK_CLIENT_ID` /
`AWORK_CLIENT_SECRET`. Token endpoint uses HTTP Basic auth; scopes
`full_access offline_access` (the latter is required to receive a refresh token).
API requests authenticate with `Authorization: Bearer {access_token}`.

Pagination: `page` (1-based) + `pageSize` query params; list endpoints return
bare JSON arrays.

## Resources

- **Projects** — `GET /projects`, `GET /projects/{id}`.
- **Tasks** — `GET /projects/{projectId}/tasks`, `GET /tasks/{id}`. Subtasks →
  `Task.parentId` (awork `parentId`). Priority derived from the `isPrio` flag.
- **Comments** — list-only via `GET /tasks/{taskId}/comments` (awork has no
  single-comment GET endpoint).
- **Users** — `GET /users`, `GET /users/{id}`. Email read from
  `userContactInfos` (`type: "email"`).

## Model notes

- awork has no separate workspace entity (one workspace per account), so
  Workspace resources are not exposed (auto-501). Companies are surfaced as the
  closest grouping on `Project.workspaceId`.
- Tags have no standalone list endpoint (returned nested on projects/tasks), so
  Tag resources are not exposed (auto-501).
- awork webhooks carry no signature/HMAC, so `verifyWebhook` is not implemented.

Refused: attachment content, time-tracking, user PII beyond name+email.
