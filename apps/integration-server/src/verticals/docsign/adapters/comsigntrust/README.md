# ComsignTrust adapter

ComsignTrust WeSign REST API v3 → canonical docsign schema.

WeSign publishes its OpenAPI at
https://wse.comsigntrust.com/api/swagger/v3/swagger.json (servers: `/api`,
paths under `/v3/...`). A WeSign **document collection** is the envelope.

## Resource mapping

| Canonical | WeSign operation |
|---|---|
| `Envelope` list | `GET /v3/DocumentCollections?offset&limit` → `documentCollections[]` (0-based row offset; total in `x-total-count`) |
| `Envelope` | `GET /v3/DocumentCollections/info/{id}` |
| `Signer` | `signers[]` of the info response, paged locally; id `<collectionId>:<signerId>` |
| `Document` | `documentsIds[]` of the info response, paged locally, each resolved by `GET /v3/DocumentCollections/{id}/documents/{documentId}/pages` (name + page count); id `<collectionId>:<documentId>` |
| `AuditTrailEntry` | refused (501): the trace is only a file download (`GET /v3/DocumentCollections/{id}/audit/{offset}`, `format: binary`) |
| `Template` | not implemented (WeSign documents `GET /v3/Templates`) |

## Auth

The spec's only security scheme is `Authorization: Bearer {token}` (a JWT).
The Connect Link form collects that token as `credentials.accessToken`.
`getAuthUrl()` throws: there is no interactive OAuth flow.

## Refused fields

- Document content / file bytes (no file-bearing endpoint is called)
- Signer `attachments[].base64File`, contact `seals[].base64Image`, and
  `signerAuthentication.otpDetails` (which carries the OTP code) are stripped
  from `raw`
