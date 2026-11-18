# Stackby adapter

Stackby REST API → canonical projects schema. No-code spreadsheet/database platform.

Auth: API key via `api-key` header. Collected through the Connect Link form (simpleApiKey).

Webhooks: not implemented — Stackby has no documented inbound signed-webhook API.

## Model notes

- Projects: Stackby has no list-stacks endpoint. The canonical project id is `{stackId}/{tableName}`.
- Tasks: rows in a Stackby table. `GET /rowlist/{stackId}/{tableName}` returns `[{ rowId, field }]`.
  Column names are user-defined; canonical fields (title, status, priority, etc.) are resolved by
  scanning common column names case-insensitively.
- Comments, Tags, Workspaces, Users: not implemented — no public API endpoints available.
- Pagination: `offset` (0-based) + `maxrecord` page size; keep fetching until empty array.

Refused: attachment content, time-tracking, user PII beyond name+email.
