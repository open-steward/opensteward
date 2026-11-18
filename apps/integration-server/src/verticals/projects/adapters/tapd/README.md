# TAPD adapter

TAPD REST API (Tencent Agile Product Development) → canonical projects schema.

HTTP Basic Auth with `api_user` + `api_password` (application credentials from the TAPD open platform).
No OAuth2 flow; credentials collected via Connect Link form.

Docs: https://open.tapd.cn/document/api-doc/

## Model notes

- TAPD "workspace" = canonical Project AND Workspace (company is the org; each workspace is a project).
- Stories (requirements/user stories) → canonical Task.
- Sub-stories via `parent_id` → `Task.parentId`.
- TAPD labels → canonical Tag (workspace-scoped).
- Workspace members → canonical User.
- Comments (`entry_type=stories`) → canonical Comment.

## Auth

Connect Link form: two fields — Application ID (`apiUser`) and Application Secret (`apiPassword`).
Both stored concatenated as `apiUser:apiPassword` in `credentials.accessToken` for Basic Auth header construction.

## Pagination

Page-number based: `page` (1-based, default 1) + `limit` (default 200, max 200).

## Webhooks

TAPD does not expose signed inbound webhooks in its public API. `verifyWebhook` and
`parseWebhookEvents` are intentionally NOT implemented.

## Not implemented (auto-501)

Tags are implemented via TAPD labels. Webhooks are absent. No sandbox environment exists.
