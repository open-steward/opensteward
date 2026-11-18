# Nuclino adapter

Nuclino REST API → canonical projects schema.

Auth: API key passed directly in the `Authorization` header (no Bearer prefix).

## Model mapping

| Nuclino concept | Canonical resource |
|---|---|
| Team | Workspace |
| Workspace | Project |
| Item / Collection | Task |
| User | User |

- Comments and tags have no public API equivalent; those methods are not implemented.
- Webhooks are not documented in the Nuclino public API.
- Pagination: cursor-based via `after` (UUID) + `limit` (1-100, default 100).

Refused: attachment content, time-tracking, user PII beyond name+email.
