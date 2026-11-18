# Juro adapter

Juro contract-automation REST API (v3) → canonical docsign schema.

Auth: static **API key** in the `x-api-key` header (no OAuth). Generate it in
Juro under Settings → Integrations → API & webhooks → API. Collected via the
shared `simpleApiKey` Connect Link form.

- Base URL: `https://api.juro.com` (sandbox: `https://api-sandbox.juro.io`)
- Pagination: `skip` (offset) + `limit` (default 50, max 200)

Resource mapping:

- **Envelopes** ← contracts (`GET /v3/contracts`, `GET /v3/contracts/:id`).
  `voidEnvelope` maps to `DELETE /v3/contracts/:id` (Juro has no void verb).
- **Signers** ← `contract.signingSides[].signatures[]` (nested; no top-level
  endpoint). Internal parties carry `username`, external carry `email`/`name`.
- **Documents** ← one synthetic metadata-only document per contract (Juro has
  no standalone document resource).
- **Templates** ← `GET /v3/templates`, `GET /v3/templates/:id`.

Not supported (auto-501): **audit-trail entries** — Juro exposes no audit /
timeline / history endpoint; lifecycle events are delivered via webhooks.

Webhook: HMAC-SHA256 of the raw body using the shared secret, sent in the
`signature` header as `sha256 <hex>`.

Refused: contract PDF content (`GET /v3/contracts/:id/pdf/binary`) is never read.
