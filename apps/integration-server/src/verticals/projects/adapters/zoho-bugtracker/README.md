# ZohoBugtracker adapter

Zoho BugTracker REST API → canonical projects schema.

OAuth2. Scopes: `ZohoBugTracker.portals.READ`, `ZohoBugTracker.projects.READ`, `ZohoBugTracker.bugs.READ`, `ZohoBugTracker.users.READ`.

Auth header: `Zoho-oauthtoken <access_token>`. Tokens expire after 3600 s; refresh via `refresh_token`.

No documented webhook signature verification — webhook methods are not implemented.

## Model notes

- **Portal** = Workspace. All resources are scoped under `/restapi/portal/[PORTALID]/`.
- **Bug** = Task. Bugs are the primary work-item resource; the bugs API supports `severity` → canonical `priority`.
- **Tags**: Zoho BugTracker does not have a tags concept for bugs; `listTags`/`getTag` are not implemented (auto-501).
- Pagination uses `index` (1-based) + `range` (max 100).
- Composite IDs used for standalone `get*` calls: `"portalId:projectId"` for projects, `"portalId:projectId:bugId"` for bugs, etc.

Refused: attachment content, time-tracking, user PII beyond name+email.
