# Zoho Sprints adapter

Zoho Sprints REST API → canonical projects schema.

OAuth 2.0. Scopes: `ZohoSprints.sprints.READ`, `ZohoSprints.projects.READ`, `ZohoSprints.teams.READ`, `ZohoSprints.teamusers.READ` (users; "Applicable only for Admins.").

Auth header: `Authorization: Zoho-oauthtoken <access_token>`.

No public webhook API with documented signature verification — webhook methods are not implemented.

## Model notes

- **Workspace** → Zoho Sprints Team (`GET /zsapi/teams/`).
- **Project** → Zoho Sprints Project (`GET /zsapi/team/{teamId}/projects/`).
- **Task** → Zoho Sprints Item, collected across all sprints + backlog for a project.
- **Comment** → Item Activity entries where `type === 1` (comment activities).
- **User** → Workspace user (`GET /zsapi/team/{teamId}/users/?action=data&index&range`; positional `userIds`/`userJObj`/`user_prop` rows).
- Tags are not a Zoho Sprints API resource; `listTags`/`getTag` are not implemented (auto-501).
- Subtasks → `Task.parentId` via `immediateParentId` (0 = top-level item).
- Pagination uses 1-based `index` + `range` query params (rate limit: 30 calls/min).

Refused: attachment content, time-tracking, user PII beyond name+email.
