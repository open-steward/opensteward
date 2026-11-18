# Bird adapter (`reply-bird-conversations`)

Customer-support adapter for Bird (formerly MessageBird).

API: https://bird.com/docs/api (spec: https://bird.com/openapi.json). All paths live under `/v1`
on the regional host `https://{region}.platform.bird.com`; the region comes from the API key
prefix (`bk_us1_…` → us1, `bk_eu1_…` → eu1). Auth: `Authorization: Bearer <key>`. Keys belong to
a workspace, so no workspace id is needed. Contacts need `email_marketing:read`; tickets,
messages and tags need `mailbox:read` ("Read mailboxes, threads, and messages").

Paging: `limit` (1–100, default 25) and `starting_after` ← `next_cursor`; `next_cursor: null` ends
the list.

Supported:

- tickets: email threads (`GET /v1/email/threads`, `GET /v1/email/threads/{thread_id}`). An
  unlabelled list is the inbox only, so the list walks the four placement folders (`inbox`,
  `archive`, `spam`, `blocked`) one after another. Status comes from the placement: inbox is
  open, archive closed, spam and blocked unknown.
- messages: `GET /v1/email/threads/{thread_id}/messages?include=extracted_text`.
- tags: custom labels of every mailbox (`GET /v1/email/mailboxes`, then
  `GET /v1/email/mailboxes/{mailbox_id}/labels`). Tag ids are `{mailbox_id}:{label}`, and a
  ticket's `tagIds` use the same form.
- contacts (`GET /v1/contacts`, `GET /v1/contacts/{contact_id}`).

Refused with 501 NOT_SUPPORTED: users (agents), teams, macros. The adapter was written against the
retired workspace API (`api.bird.com/workspaces/{id}/…`, `AccessKey` auth), which Bird no longer
documents; the current API has no endpoints for these resources.

Webhook: legacy `messagebird-signature` HMAC scheme, not re-verified against the current docs.

## Refused

- Contact custom `data` properties and audience memberships
