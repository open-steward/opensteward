# Weekdone adapter

Weekdone REST API v1 → canonical projects schema.

OAuth2 Authorization Code flow. Token passed as `?token=` query param on all requests.
Base URL: `https://api.weekdone.com/1/`

Webhooks: not documented by Weekdone — not implemented.

## Model notes

- Teams → canonical Workspace.
- Objectives (OKRs) → canonical Project. Scoped by team_id.
- Items (weekly report entries: Plans/Progress/Problems) → canonical Task. Scoped by team_id.
- Item comments → canonical Comment.
- Tags (Weekdone labels) → canonical Tag.
- Users → canonical User; team memberships populate workspaceIds.

Refused: attachment content, time-tracking, user PII beyond name+email.
