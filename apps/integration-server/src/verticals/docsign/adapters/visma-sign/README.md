# Visma Sign adapter

Visma Sign REST API → canonical docsign schema. Finnish, Visma ecosystem.

Auth: per-connection API client identifier (UUID) + secret key (32 bytes, base64), entered on the Connect form. Every request is signed as documented under "Authentication" at https://sign.visma.net/api/docs/v1/: `Content-MD5`, `Content-Type: application/json`, an RFC 2822 `Date` and `Authorization: Onnistuu <client_identifier>:base64(HMAC-SHA512(verb\nContent-MD5\nContent-Type\nDate\npath?query, base64-decoded secret))`. No OAuth, no refresh, no deployment env vars. The secret is stored as `accessToken`, the identifier in `extra.clientIdentifier`.

Webhook: HMAC-SHA256 in `X-Visma-Signature` (hex).

Reads follow the Visma Sign API v1 docs (https://sign.visma.net/api/docs/v1/):

- envelopes: `GET /api/v1/document/?category=all&offset=N` ("Search documents"), walked by `offset` to `total` with `pageByRows` (no page-size parameter exists);
- one envelope, its signers and its files: `GET /api/v1/document/{uuid}` ("Get document status"), signers and files paged locally; a file's id is `<documentUuid>:<index>`, the pair "Get document file" addresses it by;
- one signer: `GET /api/v1/invitation/{uuid}` ("Get invitation status");
- templates: `GET /api/v1/invitation-template`, a bare array, paged locally; `getTemplate` finds the id in it (no single-template read is documented).
- void: `POST /api/v1/document/{uuid}/cancel` ("Cancel a document").

Audit trail: refused with 501 NOT_SUPPORTED. The API documents no audit, event or history action, and the document status carries no timestamps. The invitation `passphrase` is stripped from `raw`.

Refused: document content, signature images.
