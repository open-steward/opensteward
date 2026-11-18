# Favro adapter

Favro REST API (`https://favro.com/api/v1`) → canonical projects schema.

Auth: HTTP Basic (account email + personal API token) plus a required
`organizationId` header on every organization-scoped route. No OAuth2 — the
Connect Link form collects `email` + `apiToken` + `organizationId` (`customForm`).
The token is stored as `accessToken`; email and organization id ride on
`credentials.extra`.

Pagination: list responses are `{ requestId, page, pages, limit, entities }`,
paged via `?requestId=<id>&page=<n>` (0-based).

## Model notes

Favro hierarchy: Organization > Collection > Widget > Card.

- Workspaces ← organizations (`/organizations`)
- Users ← users (`/users`, organization-scoped via the `organizationId` header)
- Projects ← widgets / boards (`/widgets`)
- Tasks ← cards (`/cards?widgetCommonId=...`); `parentCardId` → `Task.parentId`,
  `assignments[].userId` → `assigneeIds`, `tags` → `tagIds`. Completion derived
  from assignments (all assignees `completed`).
- Comments ← comments (`/comments?cardCommonId=...`)
- Tags ← tags (`/tags`)

Collections are presentational containers folded into project
`metadata.collectionIds`, not surfaced as a canonical resource.

Webhooks: Favro provides only outbound webhooks (board-to-destination
automations); there is no inbound signed webhook to verify per connection, so no
webhook handler is implemented here.

Refused: attachment content (only `attachmentCount`), time-tracking, user PII
beyond name + email.
