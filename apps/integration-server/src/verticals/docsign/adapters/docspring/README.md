# DocSpring adapter

DocSpring REST API → canonical docsign schema. DocSpring fills PDF templates and
collects e-signatures through data requests.

Reference: the OpenAPI schema at https://docspring.com/api-docs/v1/swagger.json
(linked from https://docspring.com/docs/api-guide/openapi-schema/).

Auth: HTTP Basic, `base64(token_id:token_secret)`, against
`https://sync.api.docspring.com/api/v1`
(https://docspring.com/docs/api-guide/authentication/).

| Canonical | DocSpring | Paging |
|---|---|---|
| Envelope | submission — `GET /submissions`, `GET /submissions/{id}` | cursor (`cursor`, `limit`, `next_cursor`) |
| Signer | data request — embedded `data_requests`, `GET /data_requests/{id}` | local |
| Template | `GET /templates`, `GET /templates/{id}` | `page` / `per_page` (max 50) |
| Document | refused (501): no document resource or id | — |
| Audit trail | refused (501): only a PDF at `audit_trail_download_url` | — |

`voidEnvelope` still posts to `/transactions/{id}/cancel`, which DocSpring does
not document; the documented analogue is `DELETE /submissions/{submission_id}`
("expireSubmission").

Webhook: HMAC-SHA256 in `X-DocSpring-Signature` (hex).

Refused: document content, signature images.
