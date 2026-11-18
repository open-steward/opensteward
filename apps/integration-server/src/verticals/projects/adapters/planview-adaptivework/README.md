# Planview AdaptiveWork (Clarizen) adapter

Planview AdaptiveWork (formerly Clarizen) REST API v2.0 → canonical projects schema.

Auth: **api_key / session**. No OAuth and no static token — a username + password
are exchanged at login for a short-lived `sessionId` (`Authorization: Session <sessionId>`),
routed to the org's data center (resolved via `getServerDefinition`). Collected via the
Connect Link form (`customForm`: `userName` + `password`). `refreshCredentials` re-logs-in
when the session lapses.

Base: data-center origin discovered at login (e.g. `https://api2.clarizen.com/v2.0/services`),
stored on `credentials.extra.baseUrl`. Login server: `https://api.clarizen.com/V2.0/services`.

## Model notes

- Reads: `GET data/objects/{TypeName}/{uuid}?fields=…` (single) and
  `POST data/entityQuery` (`{ typeName, fields, where, paging }`, collections).
- Pagination: numeric `paging.from` / `paging.limit`; `paging.hasMore` flags more rows.
- Entity ids are AdaptiveWork URIs (`/Project/<uuid>`); the canonical id keeps the full URI.
- Projects ← `Project`; Tasks ← `Task` (where `Project = …`); Comments ← `Discussion`
  (where `Container = task`); Workspaces ← `Organization` (single tenant org from login);
  Users ← `User`.
- Subtasks → `Task.parentId` (AdaptiveWork `Parent`). Status/priority mapped from the
  `State` / `Priority` enums (with `PercentCompleted` as a fallback for task status).

Not implemented (auto-501): **Tags** — AdaptiveWork has no first-class tag/label entity on
work items. No inbound signed webhooks on the REST API, so no webhook verification/parsing.

Refused: attachment content, time-tracking, user PII beyond name+email, custom-field schemas.
