# Perdoo adapter

Perdoo GraphQL API → canonical projects schema.

API key (bearer token). Generate from Personal Settings → Integrations in Perdoo.

No webhooks documented.

## Model notes

- Objective → canonical Project (top-level OKR goal).
- KeyResult / Initiative → canonical Task (measurable result under an objective; both types surfaced).
- Group → canonical Workspace (Perdoo teams/departments; no true workspace concept).
- Comments and standalone Tags are not available via the Perdoo GraphQL API; both auto-respond 501.
- Pagination is relay-style (cursor-based `first`/`after`).

Refused: attachment content, time-tracking, user PII beyond name+email.
