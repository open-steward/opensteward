# Planfix adapter

Planfix REST API → canonical projects schema.

Per-account REST API at `https://{account}.planfix.com/rest`. Auth is a static
HTTP **Bearer token** the primary admin mints under Account management → API
Access → REST API. No OAuth2 authorization-code flow, so credentials are
collected via the Connect Link form (`customForm`): **account** host +
**REST API token**. The token is stored as `accessToken`; the account host rides
on `credentials.extra.account` to build the per-account base URL.

## Resource mapping

| Canonical  | Planfix    | Endpoints                                            |
| ---------- | ---------- | ---------------------------------------------------- |
| Projects   | projects   | `POST /project/list`, `GET /project/{id}`            |
| Tasks      | tasks      | `POST /task/list` (project filter), `GET /task/{id}` |
| Comments   | comments   | `POST /task/{id}/comments/list`, `GET /comment/{id}` |
| Users      | employees  | `POST /user/list`, `GET /user/{id}`                  |

## Model notes

- **Pagination**: list methods POST `{ offset, pageSize, fields }`. `pageSize`
  is capped at 100; `fields` is a comma-separated allow-list (Planfix returns
  only `id` by default). Responses are enveloped as
  `{ result: "success", <collection>: [...] }`.
- **Tasks by project** use a complex-task filter `{ type: 5, operator: "equal", value: projectId }`.
- **Subtasks** → `Task.parentId` (Planfix `parent.id`).
- **Timestamps** are `TimePoint` objects `{ date, time, datetime }` → strict ISO-8601.
- **People** are namespaced string ids (`"user:42"`, `"contact:7"`, `"group:8"`);
  assignees/recipients flatten the `{ users, groups }.users` ids.
- **Status** is account-configurable; task status is classified by name keyword
  (falls back to `unknown`). Project status is a bare `{ id }` reference, so the
  canonical status only distinguishes deleted (`archived`) from active.

## Not supported (auto-501)

- **Tags** — Planfix has no freeform task-tag resource. Its "data tags" are
  structured data-entry forms on comments, not a label taxonomy; no `/tag/list`.
- **Workspaces** — Planfix is single-account; the account host *is* the
  workspace, so there is no enumerable workspace resource.
- **Webhooks** — only outbound notifications, no documented inbound signed
  webhook a connector verifies per connection.

Refused: attachment content (only `attachmentCount`), time-tracking, user PII
beyond name + email, custom-field schemas (values land in metadata).
