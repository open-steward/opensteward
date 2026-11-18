# Inkit adapter

Inkit REST API → canonical docsign schema. Inkit is a document-**generation**
platform (render documents from templates + merge parameters, then deliver to
destinations), not an e-signature service.

Auth: static API token in the `X-Inkit-API-Token` header. Base URL
`https://api.inkit.com/v1`.

Implemented resources:

- **Documents** — generated-document records (`GET /document`, `GET /document/{id}`), metadata only.
- **Templates** — document templates (`GET /template`, `GET /template/{id}`).

Not supported (router returns 501): envelopes, signers, audit-trail entries —
Inkit has no signing workflow.

Webhook: HMAC-SHA256 (hex) of the raw body in `Inkit-Signature`, keyed by the
per-webhook secret.

Refused: generated-document file content (the download endpoint is never called).
