# Projectplace adapter

Projectplace (Planview) REST API → canonical projects schema.

OAuth2 (authorization code, Bearer) + REST. Base URL `https://api.projectplace.com`.
`PROJECTPLACE_CLIENT_ID` / `PROJECTPLACE_CLIENT_SECRET`.

Docs: https://service.projectplace.com/apidocs/

## Model notes

- The Projectplace **project** is the canonical *workspace* as well as the *project* —
  `Workspace.id` and `Project.id` are the same project id.
- Work items are **cards** (`/1/boards/{board_id}/cards`), enumerated by first listing a
  project's boards (`/1/projects/{project_id}/boards`) then aggregating their cards.
  A single card is fetched via `/1/cards/{id}`.
- Cards are grouped under planning activities (**planlets**); `planlet_id` → `Task.parentId`.
- Comments come from the v3 conversations API
  (`/3/conversations/comments?item_id=&item_name=card`), anchored to a card by
  `item_id` + `item_name`.
- Users are project **members** (`/1/projects/{project_id}/members`).
- Timestamps `create_time` / `modify_time` are Unix epoch seconds; `due_date` / `start_date`
  are calendar dates.

## Not implemented

- **Tags** — Projectplace labels are board-column-scoped, not workspace-scoped tags; no clean
  canonical mapping. (Auto-501.)
- **Workspaces** (list/get) and **getUser** — no distinct top-level account-list or
  per-member-by-id endpoints. (Auto-501.)
- **Webhooks** — Projectplace exposes board-webhook *management* via API but documents no
  inbound signature scheme, so no verification/parsing is provided.

Refused: attachment content, time-tracking, user PII beyond name+email.
