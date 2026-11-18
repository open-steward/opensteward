# Quickbase adapter

Quickbase REST API (`https://api.quickbase.com/v1`) → canonical projects schema.

Auth: static **user token** + **realm host**. Calls send
`Authorization: QB-USER-TOKEN user_token=<token>` and `QB-Realm-Hostname: <realm>.quickbase.com`.
Collected via the Connect form (`credentialFields`); no OAuth.

## Resource mapping

Quickbase is a low-code relational platform, so its primitives map structurally:

- app → **Workspace** — `GET /apps/{appId}`. No list-all endpoint; `listWorkspaces` resolves `params.app_id` to a single app.
- table → **Project** — `GET /tables?appId=`. `listProjects` requires `params.app_id`.
- record → **Task** — `POST /records/query` (`from = tableId`, `options.skip`/`options.top`). Cells are keyed by numeric field id under a `{ value }` envelope; built-in fields 1 (created), 2 (modified), 3 (Record ID#), 4 (owner) drive the canonical fields, and scalar cells are surfaced under `metadata.field.<fid>`.
- field → **Tag** — `GET /fields?tableId=`. The closest analog to a tag/label set.

## Not implemented (auto-501)

- `getProject` / `getTask` / `getTag` — the single-resource GETs need a parent appId/tableId that the `get*(id)` signature can't carry.
- Comments and users — Quickbase exposes no REST endpoint for either (user management is SCIM/group-only).

Refused: attachment content, time-tracking, user PII beyond name+email. Quickbase Pipelines webhooks ship no documented REST signature scheme, so webhook verification is omitted.
