# ONES adapter

ONES Project OpenAPI v2 (`/openapi/v2`) → canonical projects schema.

OAuth2 (3-legged, authorization-code + refresh). `Authorization: Bearer <token>`.
Hosts are domain-scoped (e.g. `https://acme.ones.com`), so the adapter takes a
`domain` config and derives the API/OAuth URLs from it.
`ONES_CLIENT_ID` / `ONES_CLIENT_SECRET`.

Read scopes: `read:project:project`, `read:project:issue`,
`read:project:issue-comment`, `read:account:user`.

## Model notes

- Canonical **task** = ONES **issue** (`/project/issues`). Sub-issues →
  `Task.parentId` (ONES `parentUUID`). `metadata.platformType` =
  `issue` / `subissue`.
- Comments come from `/project/issues/:id/comments` (`{ id, text, owner, createTime }`).
- Users come from `/account/users/search` (teamID = canonical workspace id; PII-minimal: id, name, email).
  `getUser` refuses (501): the only lookup, `/account/users/batch`, requires a teamID.
- Responses use a `{ result, data: { list, pageInfo } }` envelope; cursor
  pagination via `pageInfo.endCursor` / `hasNextPage`.
- Timestamps are Unix epoch **seconds**, normalised via `toIsoDatetime`.

## Not implemented

- **Tags / workspaces** — ONES OpenAPI exposes no canonical tag or workspace
  resource. Those methods are omitted (dispatcher returns 501).
- **Webhooks** — ONES v2 OpenAPI exposes no webhook subscription API, so there
  is no webhook verification/parsing handler.

Refused: attachment content, time-tracking/worklogs, user PII beyond name+email.
