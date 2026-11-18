# Redmine adapter

Redmine REST API → canonical projects schema.

Self-hosted. API key in `X-Redmine-API-Key` header. Instance URL stored in `credentials.extra.host`.

## Model notes

- Projects map to canonical `Project`; Redmine has no workspace concept (workspaceId is empty string).
- Issues map to canonical `Task`; parent issues → `Task.parentId`.
- Issue journals with non-empty `notes` map to canonical `Comment`. Comments are embedded in issue detail (`?include=journals`); `getComment` id format is `{issueId}:{journalId}`.
- Tags and Workspaces are not implemented (no corresponding Redmine core resource).
- `listUsers` requires Redmine admin privileges; returns empty array for non-admin users.

Refused: attachment content, time-tracking, user PII beyond name+email.
