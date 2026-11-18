# SmartSuite adapter

SmartSuite REST API → canonical projects schema.

Auth: API key (`Authorization: Token <key>`) + Account ID (`ACCOUNT-ID` header). No OAuth.

## Resource mapping

| SmartSuite       | Canonical     | Endpoint                                          |
|------------------|---------------|---------------------------------------------------|
| Solution         | Project       | `GET /api/v1/solutions/`                          |
| Table (App)      | projectId ref | `GET /api/v1/applications/`                       |
| Record           | Task          | `POST /api/v1/applications/{tableId}/records/list/` |
| Comment          | Comment       | `GET /api/v1/comments/?record={id}`               |
| Member           | User          | `POST /api/v1/members/list/`                      |
| Account (synth.) | Workspace     | derived from credentials                          |

## Model notes

- `getTask` requires composite id `"tableId:recordId"` (SmartSuite record lookup needs the table id).
- Tags: no native tags resource; `listTags`/`getTag` refuse with 501 NOT_SUPPORTED before sending anything.
- Webhooks: SmartSuite webhooks use a pull-based payload model (no HMAC signature); `verifyWebhook`/`parseWebhookEvents` are not implemented.
- Pagination: records and members page by `limit` + `offset` query params (default 100, max 1000). Comments document no page size: the adapter follows each response's `next` URL (API host only) and cuts the caller's rows out.

Refused: attachment content, time-tracking, user PII beyond name+email.
