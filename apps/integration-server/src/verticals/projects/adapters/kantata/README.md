# Kantata adapter

Kantata OX (formerly Mavenlink) REST API → canonical projects schema.

OAuth2 (authorization-code) + REST. `KANTATA_CLIENT_ID` / `KANTATA_CLIENT_SECRET`.

- Base URL: `https://api.mavenlink.com/api/v1` (endpoints end in `.json`).
- Auth: `Authorization: Bearer <token>`. Kantata OX access tokens **do not expire** and there is no refresh-token flow.
- Pagination: `page` & `per_page` (max 200).
- Envelope: every response carries a `results` array of `{ key, id }` references plus typed top-level maps keyed by id. The canonical, ordered records come from `results` (associations of the same type are side-loaded into the same map). Associations are only present when requested via `include`.

## Resource mapping

- canonical `Project` ← Kantata **Workspace** (`/workspaces.json`)
- canonical `Task` ← Kantata **Story** (`/stories.json`, scoped by `workspace_id`)
- canonical `Comment` ← Kantata **Post** (`/posts.json`, filtered to a Story via `story_id`)
- canonical `User` ← Kantata **User** (`/users.json`)

## Not implemented

- canonical `Workspace` — Kantata's org is the Account; there is no suitable list endpoint, so it auto-501s.
- canonical `Tag` — Kantata tags are comma-separated strings on a Story (`tag_list` / `tag_ids`), not a first-class workspace-scoped resource, so tag methods auto-501.
- Webhooks — Kantata OX has no documented webhook product.

## Model notes

- Subtasks (sub-stories) → `Task.parentId` (Kantata `parent_id`).
- Story `state` → canonical `TaskStatus`; integer `priority` → canonical `TaskPriority`.

Refused: attachment content, time-tracking / financials, user PII beyond name+email.
