# Vikunja adapter

Vikunja REST API v1 → canonical projects schema.

## Auth

API token (`Authorization: Bearer <token>`). Generated from Settings > API Tokens in the Vikunja web UI. No OAuth2 flow — credentials are collected through the Connect Link `simpleApiKey` form. Self-hosted users supply a custom base URL stored in `extra.baseUrl`.

## Supported resources

| Canonical resource | Vikunja endpoint |
|---|---|
| Projects | `GET /projects`, `GET /projects/{id}` |
| Tasks | `GET /projects/{id}/tasks`, `GET /tasks/{id}` |
| Comments | `GET /tasks/{id}/comments` |
| Tags (Labels) | `GET /labels`, `GET /labels/{id}` |
| Workspaces | Synthetic: root projects from `GET /projects` (parent_project_id == null) |
| Users | `GET /projects/{id}/projectusers` |

## Notes

- Vikunja has no workspace concept. Root-level projects (those with no parent) are surfaced as canonical workspaces.
- Labels are user-owned (not workspace-scoped); the `workspaceId` filter argument is ignored when listing labels.
- `getUser` falls back to the admin users endpoint since there is no single-user GET in the public API.
- Webhook verification: HMAC-SHA256 over the raw JSON body, hex-encoded, sent as `X-Vikunja-Signature`.
- Pagination: `page` (1-based) + `per_page`.
- Self-hosted instances: set `extra.baseUrl` on the credentials object (without trailing slash).
