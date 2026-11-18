# Coda adapter

Coda REST API (`https://coda.io/apis/v1`) → canonical projects schema.

API-key auth. Long-lived token in `Authorization: Bearer <token>`, collected via the Connect Link form (single API-token field, `simpleApiKey`). No OAuth2 authorization-code flow.

Pagination: `{ items, nextPageToken, nextPageLink }` envelope with an opaque `pageToken` cursor and a `limit`.

## Model notes

Coda's hierarchy is Workspace > Folder > Doc > Table > Row.

- **Projects ← docs** — `GET /docs`, `GET /docs/{docId}`. Docs have no status concept, so all docs report `active`.
- **Tasks ← tables** — `GET /docs/{docId}/tables`, `GET /docs/{docId}/tables/{tableId}`. Canonical task id is the composite `{docId}:{tableId}` (Coda's per-table GET is doc-scoped). Views point at a base table via `parentTable` → `Task.parentId`. `rowCount` → `subtaskCount`.
- **Workspaces ← workspaces** — derived: Coda has no list-workspaces endpoint, so workspaces are deduped from docs' `workspace` reference plus the active token's `/whoami`.
- **Users ← workspace members** — `GET /workspaces/{workspaceId}/users` (keyed by login email). `getUser` resolves the active token via `/whoami`; Coda exposes no per-user GET-by-id.

Not implemented (auto-501): **Comments** and **Tags** — Coda has no comment or tag/label API.

No webhooks: Coda's "webhook trigger" is an outbound automation entry point, not an inbound signed delivery, so there is no signature verification.

Refused: row cell values / attachment content, time-tracking, user PII beyond name+email.
