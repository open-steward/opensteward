# Toggl Plan adapter

Toggl Plan REST API v5 → canonical projects schema.

Auth: API key (Bearer token + workspace ID supplied at credential-exchange time).

No webhooks documented.

## Model notes

- Projects: `GET /{workspace_id}/projects` — id, name, color, archived, timestamps.
- Tasks: `GET /{workspace_id}/tasks/timeline` — id, name, notes, start/end date, status, assignees (workspace_members), tag_ids.
- Workspaces: mapped from `GET /{workspace_id}/groups` — groups are sub-divisions of the workspace.
- Users: `GET /{workspace_id}/members` — member objects with id, name, email, role, active.
- Comments: no API endpoint available.
- Tags: no standalone tag management endpoint (tag_ids referenced on tasks only).

Refused: attachment content, time-tracking detail, user PII beyond name+email.
