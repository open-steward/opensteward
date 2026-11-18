# Paymo adapter

Paymo REST API → canonical projects schema.

API key + HTTP Basic auth (key as username, ignored password). Single-tenant base URL `https://app.paymoapp.com/api`. Credentials collected via the Connect Link form (`simpleApiKey`) — no OAuth.

Webhook: HMAC-SHA1 in `X-Paymo-Signature` (prefixed `sha1=`), keyed by the per-webhook secret. Event name (`model.[action].[Object]`) ships in the `X-Paymo-Event` header.

## Model notes

- List responses are unpaginated objects keyed by the plural resource name (`{ "projects": [...] }`); single-resource GETs return the same one-element wrapper. Server-side filtering uses `?where=`.
- Project status: derived from the `active` boolean (active → `active`, false → `archived`). Paymo has no on-hold/completed state.
- Tasks filtered by project via `?where=project_id={pid}`. Paymo priority integers (1–4) → low/medium/high/urgent.
- Comments hang off threads; per-task list via `/threads?where=task_id={tid}&include=comments`, single via `/comments/{id}`.
- Tags and Workspaces are NOT implemented — Paymo has no tag concept and an account is a single company (no workspace). Those methods auto-respond 501.

Refused: attachment content, time-tracking, user PII beyond name+email.
