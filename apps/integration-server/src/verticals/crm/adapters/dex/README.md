# Dex CRM Adapter

Docs: https://getdex.com/docs/api-reference (OpenAPI: https://api.prod.getdex.com/docs/json)

## Auth

Reads call `https://api.prod.getdex.com` with `Authorization: Bearer <api key>`
(https://getdex.com/docs/api-reference/authentication).
Set `credentials.accessToken` to your Dex API key (Dex → Settings → Workflow → Dex API & MCP).

The write methods (create/update/delete) still target the legacy Hasura host
`https://api.getdex.com/api/rest` with `x-hasura-dex-api-key`, which the current
docs do not describe. They have not been ported yet.

## Coverage

| Resource   | Read (list/get)                          | Paging                                  |
|------------|------------------------------------------|-----------------------------------------|
| Contacts   | `GET /v1/contacts/`, `/v1/contacts/{id}` | `take` + `skip`; end when `nextCursor` null |
| Notes      | `GET /v1/timeline/`, `/v1/timeline/{id}` | `take` + `cursor` chain (no `skip` documented) |
| Activities | `GET /v1/reminders/`, `/v1/reminders/{id}` (Dex Reminders) | `take` + `skip`; end when `nextCursor` null |
| Companies  | No — Dex is a personal CRM with no company objects | |
| Deals      | No | |
| Pipelines  | No | |

`GET /v1/contacts/` returns active contacts only unless a `where` filter says
otherwise ("is_archived … Defaults to false when omitted").
