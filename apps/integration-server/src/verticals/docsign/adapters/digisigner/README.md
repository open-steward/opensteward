# DigiSigner adapter

DigiSigner eSignature API → canonical docsign schema.
Reference: https://www.digisigner.com/esignature-api/esignature-api-documentation/

Auth: personal API key over HTTP Basic auth ("A user's API key should be provided as auth
credentials: curl -u YOUR_API_KEY : ..."), base `https://api.digisigner.com/v1`.

The API has one JSON read, `GET /v1/signature_requests/{signature_request_id}`, and no list
endpoint or paging parameter.

| Resource | Source |
|---|---|
| Envelope | `getEnvelope` reads the signature request; `listEnvelopes` is refused (501) |
| Signer | `documents[].signers[]` of the signature request, paged locally; id `<request>:<document>:<email>` |
| Document | `documents[]` of the signature request, paged locally, metadata only; id `<request>:<document>` |
| Audit trail | refused (501): no audit endpoint |
| Template | refused (501): templates are configured in the dashboard, no endpoint |

`sign_document_url` (a live signing link) is stripped from every `raw`.

Backlog, not verified against the docs:
- `voidEnvelope` posts to `/transactions/{id}/cancel`, which the API reference does not have.
- `webhook.ts` checks an `X-DigiSigner-Signature` HMAC and maps `transaction.*` events. The docs
  describe callbacks with `event_type` `SIGNATURE_REQUEST_COMPLETED` / `DOCUMENT_SIGNED` and no
  signature header.

Refused: document content, signature images, signing links.
