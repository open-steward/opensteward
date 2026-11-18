# Ruddr adapter

Ruddr REST API → canonical projects schema.

## Auth

API key (long-lived Bearer token). Generate in Ruddr workspace → Settings → API Keys.
No OAuth2 flow. Key is stored as `credentials.accessToken`.
Base URL: `https://www.ruddr.io/api/workspace` (https://docs.ruddr.io/guides/conventions).

## Supported resources

| Canonical | Ruddr endpoint                                                                    |
| --------- | --------------------------------------------------------------------------------- |
| Projects  | `GET /projects`, `GET /projects/{id}`                                             |
| Tags      | `GET /task-tags` (`getTag` refuses: `TaskTag` has no workspace id)                |
| Users     | `GET /members`, `GET /members/{id}`                                               |
| Tasks     | `GET /tasks?projectId=`, `GET /tasks/{id}` (`updatedAfter` → `modifiedAtOnAfter`) |

## Not implemented

- **Workspaces** — the published OpenAPI (https://docs.ruddr.io/openapi.json) has no
  workspace resource; `listWorkspaces` / `getWorkspace` throw 501 `NOT_SUPPORTED`.
- **Comments** — no comment model in the Ruddr API
- **Webhooks** — not documented by Ruddr

## Notes

- Pagination: cursor-based via `startingAfter` (the last row's id); `limit` 1–100;
  response envelope `{ results, hasMore }` (https://docs.ruddr.io/guides/pagination).
- Task `tagIds` are task-tag ids (POST /tasks `tagIds`: "A list of task tag IDs"), so
  `listTags` serves `/task-tags` and every task tag id resolves through it.
