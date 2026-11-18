# eSignly adapter

eSignly REST API → canonical docsign schema.

## Onboarding

1. Create an eSignly account and open the API plan page to generate an API key
   (see [esignly.com/esignly-api.html](https://www.esignly.com/esignly-api.html)).
2. Copy the API key.
3. In OpenSteward, connect eSignly via the Connect Link form and paste the key.

eSignly uses a static API key — there is no OAuth flow. The adapter submits the
key as the `api_key` request parameter on every call (query string on GETs,
multipart form field on POSTs).

## Base URL

All requests go to `https://acc.esignly.com/v1`. The same host serves both
sandbox and production; the account tier is determined by the API key.

## Resources

API reference: [esignly.com/api-docs.html](https://www.esignly.com/api-docs.html)
(rendered from `eSignlyDec16-postmanCollection.json`). Every documented call
is a multipart-form POST to `https://acc.esignly.com/v1/<rpcName>/`.

| Canonical resource | eSignly source |
| --- | --- |
| Envelope | `GET /signRequests` — undocumented; the reference has `POST /v1/listSignRequest/` (not yet rebuilt) |
| Signer | `POST /v1/checkSignStatus/` → `signatures[]` (paged locally) |
| Document | refused (501): no document manifest is documented |
| Template | `GET /templates` — undocumented; the reference has `POST /v1/listTemplate` (not yet rebuilt) |
| Audit-trail entry | refused (501): no audit-trail endpoint is documented |

## Refused fields

- Document content. The download endpoint (`POST /v1/downloadDoc/`) is
  intentionally never called.
- Signature images and identity-verification (KYC) attachments are not on the
  canonical schema and are never requested.

## Webhooks

eSignly delivers JSON webhook notifications (e.g. `signature_completed`), but
does not document a signature-verification mechanism (no HMAC or signing
secret). Webhook handling is therefore not implemented in this adapter.
