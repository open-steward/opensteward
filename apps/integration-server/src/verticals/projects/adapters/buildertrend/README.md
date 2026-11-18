# Buildertrend adapter

Buildertrend partner REST API → canonical projects schema. Construction project
management for home builders, remodelers, and specialty contractors.

OAuth2 (authorization code). `BUILDERTREND_CLIENT_ID` / `BUILDERTREND_CLIENT_SECRET`.
Bearer token in `Authorization`. Base URL `https://api.buildertrend.net/v1`
(sandbox: `https://api.sandbox.buildertrend.net/v1`). Page-number pagination
(`page` / `pageSize`, max 100).

## Model notes

- **Job** → `Project`. Job lifecycle (`Presale`/`Open`/`Closed`/`Inactive`) maps to
  canonical project status.
- **Schedule item** and **To-Do** → `Task`. Both folded onto the same canonical
  shape; `metadata.platformType` records which (`scheduleItem` vs `todo`).
  Schedule phases → `Task.parentId`. `percentComplete` drives in-progress/closed.
- **Comment** (on a to-do) → `Comment`.
- **Builder account** → `Workspace` (the tenant). **User** → `User`.

Not surfaced: tags (Buildertrend has no tag concept), selections, change orders,
budgets, purchase orders, daily logs. No webhook signature scheme is documented,
so webhook verification/parsing is not implemented.

Refused: attachment content (only `attachmentCount`), time-tracking, user PII
beyond name+email.
