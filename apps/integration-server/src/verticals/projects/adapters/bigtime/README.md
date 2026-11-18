# BigTime adapter

BigTime IQ v2 REST API → canonical projects schema.

Single-host SaaS at `https://iq.bigtime.net/BigtimeData/api/v2`. Auth: a
**permanent firm API token** in the `X-Auth-Token` header plus the firm id in
the `X-Auth-Realm` header. No OAuth2 for the data API — credentials are
collected via the Connect Link form (`customForm`: `firmId` + `apiKey`).

## Supported resources

- **Projects** — `GET /project`, `GET /project/detail/{SystemId}` (`View=Detailed`).
- **Tasks** — `GET /task/listByProject/{ProjectSid}`, `GET /task/detail/{TaskSid}`.
- **Users** — `GET /staff`, `GET /staff/detail/{StaffSid}`.

## Model notes

- BigTime has **no workspace** concept (a firm is the tenant); the firm id is
  surfaced as the canonical `workspaceId` / `User.workspaceIds`.
- BigTime has **no task comments** (notes are an inline string on the task) and
  **no tags/labels**, so `listComments`/`getComment`, `listTags`/`getTag` and
  `listWorkspaces`/`getWorkspace` are left off and auto-respond 501.
- Sub-tasks → `Task.parentId` (BigTime `ParentSid`).
- Task status derives from `IsArchived` + `PerComp` (percent complete). BigTime
  has no priority concept, so `Task.priority` is omitted.
- Inactive projects/staff are excluded unless `params.show_inactive` is set
  (maps to BigTime's `?ShowInactive=true`).
- BigTime publishes **no webhooks**, so this adapter exposes no webhook hooks.

Refused: attachment content, time/expense entries, user PII beyond name+email.
