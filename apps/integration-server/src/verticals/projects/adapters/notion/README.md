# Notion adapter

Notion REST API → canonical projects schema.

OAuth2 (public integration) + REST. `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`.

- Base URL: `https://api.notion.com/v1`
- Every request sends a date-stamped `Notion-Version` header (pinned to `2026-03-11`).
- Token endpoint authenticates with HTTP Basic `client_id:client_secret`; refresh tokens are issued.
- Cursor pagination: `start_cursor` / `next_cursor` / `has_more`, `page_size` ≤ 100.

Webhook: HMAC-SHA256 in `X-Notion-Signature` as `sha256=<hex>`, signed with the integration's `verification_token`.

## Model notes

Notion has no first-class project/task/tag/workspace model, so the canonical schema is mapped onto Notion's structure:

- **Project** ← **data source** (the queryable table behind a Notion database). Listed via `POST /search` filtered to `object: data_source`; fetched via `GET /data_sources/:id`.
- **Task** ← **page** (a row inside a data source). Listed via `POST /data_sources/:id/query`; fetched via `GET /pages/:id`. Status/priority are inferred from `status`/`select`/`checkbox` properties; assignees from `people`; tags from `multi_select`; due date from the `date` property. Sub-pages (page-parented pages) → `Task.parentId`.
- **Comment** ← **comment** on a page/block. Listed via `GET /comments?block_id=…`; fetched via `GET /comments/:id`. Body flattened from the `rich_text` array.
- **User** ← workspace user (`GET /users`, `GET /users/:id`). Bots are filtered out of the list.

Not implemented (no listable Notion resource): **Tags** (tags are `multi_select` property options, not a standalone resource) and **Workspaces** (one workspace per token, no list/get endpoint). Both auto-return 501.

Refused: attachment content, time-tracking, user PII beyond name+email, custom-field schemas (values land in `metadata`).
