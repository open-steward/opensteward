# Fieldwire adapter

Fieldwire REST API v3 → canonical projects schema.

API key auth (two-step: long-lived API token exchanged for short-lived JWT via `/api_keys/jwt`).
Auth header: `Authorization: Bearer <jwt>` + `Fieldwire-Version: 2023-11-30`.

Pagination: cursor-based via `last_synced_at` / `X-Last-Synced-At` response header.

Webhooks: Fieldwire does not document a signature verification mechanism; `verifyFieldwireWebhook` accepts all payloads. Secure via network-level controls.

## Model notes

- Projects are account-scoped; `account_id` is used as `workspaceId`.
- Task status is derived from `fixed_at` / `verified_at` timestamps (closed) or open by default.
- Task priority is an integer field: 1=high, 2=medium, 3=low.
- Comments map to Fieldwire "bubbles" (notes attached to tasks).
- Tags map to Fieldwire "entity_tags" (project-scoped label objects).
- Workspaces (accounts) are not list-enumerable via a standard endpoint.

Refused: attachment content, time-tracking, user PII beyond name+email.
