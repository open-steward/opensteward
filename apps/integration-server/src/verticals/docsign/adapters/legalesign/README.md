# Legalesign adapter

Legalesign eSignature REST API (v1) → canonical docsign schema.

Legalesign is a UK-headquartered e-signature platform. A "document" is a sent
envelope; signers are nested on the document (`signer_objects`); the signing
artefact is a single composed PDF; templates come in text/html and PDF kinds.

## Onboarding

1. Create a trial account at [legalesign.com](https://legalesign.com) and select the API dev option on activation.
2. Set up 2FA, then open the **API Dashboard** at [logs.legalesign.com](https://logs.legalesign.com) to manage your API key, webhooks, and sandbox signers.
3. Copy your API key as `username:secret` (both shown together in the dashboard).
4. Note your account **region** — US (`api.legalesign.com`) or EU (`eu-api.legalesign.com`).

Sandbox vs production is toggled per account by Legalesign support; a sandbox
key simply caps you at 5 signers. There is no separate sandbox host.

## Auth

No OAuth. The Connect Link form collects the `username:secret` key (sent on
the `Authorization: ApiKey username:secret` header) plus the account region.
Keys are long-lived and do not refresh.

## Pagination

Lists use `offset` + `limit` and return a Tastypie
`{ meta: { limit, offset, total_count, next, previous }, objects: [...] }`
wrapper. The `/document/` list requires a `group` filter.

## Webhooks (callbacks)

Deliveries are HMAC-SHA256 signed; the hex-encoded signature ships in the
`X-HMAC-SHA256` header and is verified against the configured shared secret.
Payloads are keyed by `object` (`document` or `recipient`) with `event`,
`created` (unix), and a `data` block.

## Resources implemented

- Envelopes (`/document/`, `/document/{id}/`; void via `DELETE` → status 40)
- Signers (`signer_objects` on the document detail)
- Documents (the composed signing PDF — metadata only)
- Templates (`/template/` text + `/templatepdf/` PDF, merged)

Audit-trail entries are **not** implemented — Legalesign exposes only a binary
PDF audit log (`/document/{id}/auditlog/`), not a queryable event endpoint —
so the router returns 501 for those routes.

## Refused fields

- Document content (the signing PDF body and `/pdf/` / `/auditlog/` binaries are never fetched)
- Signature images

These are not on the canonical schema. The adapter never requests them.
