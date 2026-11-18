# Nifty adapter

Nifty (niftypm) REST API v1.0 → canonical projects schema.

OAuth2 (authorization-code, confidential client) + REST. The token endpoint
uses HTTP Basic auth (`base64(client_id:client_secret)`); access tokens are
sent as `Authorization: Bearer`. `NIFTY_CLIENT_ID` / `NIFTY_CLIENT_SECRET`.

Base URL: `https://openapi.niftypm.com/api/v1.0`.
Docs: https://developers.niftypm.com/

List endpoints page with `limit`/`offset` and wrap rows in an envelope
(`projects` / `tasks` / `messages` / `items`) alongside a `hasMore` /
`has_more` flag. `GET /subteams` documents no parameters and returns every
portfolio as `{ subteams, items, hasMore }`; the adapter pages it locally and
fails if Nifty flags more rows it gives no way to fetch.

Spec: https://developers.niftypm.com/docs/api/v1.0/1.0/nifty-v1-openapi.json

## Model notes

- Nifty's top-level grouping is the _subteam_ (portfolio) → canonical Workspace.
  Projects belong to a subteam; tasks belong to a project.
- Subtasks → `Task.parentId` (Nifty `task_id`). Task status is open vs. closed
  (`completed`); the kanban column id (`task_group_id`) is kept in metadata.
  Nifty has no per-task priority field, so `priority` is left undefined.
- Comments are Nifty _messages_ attached to a task (`GET /messages?task_id`);
  `tagged` carries @-mentions.
- Labels (tags) are team-scoped and list-only — Nifty exposes no single-label
  GET, so `getTag` is not implemented (auto-501s).
- Nifty webhooks ship no signature/HMAC, so no `verifyWebhook`.

Refused: attachment content, time-tracking, user PII beyond name+email.
