# GoodDay adapter

GoodDay REST API v2 → canonical projects schema.

API key auth. Token passed as `gd-api-token` header. Generate token at
Organization → Settings → API.

Base URL: `https://api.goodday.work/2.0`

## Supported resources

- **Projects** — `GET /projects`, `GET /project/{id}`
- **Tasks** — `GET /project/{id}/tasks`, `GET /task/{id}`
- **Comments** (task messages) — `GET /task/{id}/messages`
- **Users** — `GET /users`, `GET /user/{id}`

Workspaces and tags are not available as discrete list endpoints in v2
(the organisation is the single implicit workspace).

## Model notes

- `systemStatus` values: `open` → `open`, `closed`/`cancelled` → `closed`.
- `priority` field: 0=none, 1=low, 2=medium, 3=high, 4=urgent/critical.
- Dates may be epoch-ms integers or ISO strings; `toIso()` handles both.
- Subtasks: `Task.subtaskCount` populated from the `subtasks` array length on
  the parent task object.
- Task messages → canonical `Comment`; `fromUserId` → `authorId`.

## Webhooks

GoodDay supports outbound webhooks (task.create, task.status, task.close,
project.create, etc.) but does not document a signature-verification header,
so `verifyWebhook` / `parseWebhookEvents` are not implemented.

Refused: attachment content, time-tracking, user PII beyond name+email.
