# OpenProject adapter

OpenProject REST API v3 (HAL+JSON) → canonical projects schema.

OAuth2 (Doorkeeper, authorization-code flow). Scope `api_v3`. Bearer tokens
with refresh; default lifetime 7200s. `OPENPROJECT_CLIENT_ID` /
`OPENPROJECT_CLIENT_SECRET`.

Per-tenant: OpenProject runs at the customer's own origin (cloud
`https://<tenant>.openproject.com` or self-hosted). The instance origin is
supplied via the adapter config `instanceUrl` and captured at OAuth time into
`credentials.extra.instanceUrl`. All REST calls hit `{instanceUrl}/api/v3`.

Pagination: offset-based — `offset` (1-based page index) + `pageSize` (max
1000). Collections return elements under `_embedded.elements`.

Webhook: HMAC-SHA1 of the raw body in `X-OP-Signature` formatted as
`sha1=<hex>` (only sent when a "Signature secret" is configured). Body shape
is `{ action: "<resource>:<verb>", <resource>: <HAL object>, actor?: <User> }`.

## Model notes

- **Tasks** = work packages. Hierarchy is a single `_links.parent` →
  `Task.parentId`. Foreign keys (status, priority, assignee, project, type,
  category) are HAL `_links`; resolved via the trailing path-segment id.
- **Comments** = `Activity::Comment` activities on a work package
  (`/work_packages/{id}/activities`); non-comment activities are filtered out.
- **Projects** are the top container. Project lifecycle status is a separate
  `ProjectStatus` link (`on_track` / `at_risk` / `off_track` / `finished`);
  `active: false` ⇒ archived.

## Not supported

OpenProject has no workspace and no tag/label concept (categories are
per-project type metadata, not a canonical Tag). `listTags` / `getTag` /
`listWorkspaces` / `getWorkspace` are therefore not implemented and resolve to
501 at the dispatch layer. Canonical `Project.workspaceId` and
`User.workspaceIds` are empty.

Refused: attachment content, time-tracking, user PII beyond name+email.
