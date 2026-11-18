# ActiveCollab adapter

ActiveCollab Cloud REST API → canonical projects schema.

API-key auth (no OAuth2). Per-account base URL:
`https://app.activecollab.com/{accountId}/api/v1`. Self-hosted instances expose
the same `/api/v1` surface under their own origin.

Connect Link form collects two fields:

- `accountId` — numeric cloud account id (from the dashboard URL), or the full
  origin of a self-hosted instance.
- `apiKey` — API token, sent in the `X-Angie-AuthApiToken` header on every
  request.

Webhook: ActiveCollab does **not** HMAC-sign deliveries. An optional shared
secret is echoed back verbatim in the `X-Angie-WebhookSecret` header;
verification is a constant-time compare. Delivery body:
`{ payload, timestamp, type }` where `type` is PascalCase `<Resource><Action>`
(e.g. `TaskCreated`).

## Model notes

- **Projects** — `GET /projects`, `GET /projects/{id}` (single wrapped under
  `single`). Status from `is_completed` / `is_trashed`.
- **Tasks** — `GET /projects/{pid}/tasks`, `GET /projects/{pid}/tasks/{id}`.
  ActiveCollab has no global task-by-id endpoint, so the canonical task `id` is
  the composite `{projectId}:{taskId}`; `externalId` stays the bare upstream id.
  Subtasks are surfaced only as `subtaskCount`. `is_important` lands in metadata
  (ActiveCollab has no priority scale).
- **Comments** — no standalone list endpoint; read from the single-task
  wrapper's `comments` array. Single comment via `GET /comments/{id}`.
- **Tags** — ActiveCollab **labels** (`GET /labels`), account-global, so
  `workspaceId` is empty.
- **Users** — `GET /users/all`.
- **Workspaces** — not implemented. ActiveCollab has no workspace concept (an
  account is a single workspace); those methods auto-respond 501.

Refused: attachment content, time-tracking, user PII beyond name+email.
