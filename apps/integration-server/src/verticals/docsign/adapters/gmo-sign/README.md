# GMO Sign adapter

GMO Sign (GMO GlobalSign Holdings) "agree-api" REST API → canonical docsign schema.

Maps a single `/envelope/status` response to the canonical `Envelope`, its embedded `signer_list` → `Signer`, and its `document_list` → `Document` (metadata only). GMO Sign exposes no read endpoints for listing all envelopes, audit-trail entries, or templates, so those resources are intentionally not implemented (the router returns 501).

## Onboarding

1. Subscribe to a GMO Sign API plan — the API option is enabled by GMO Sign support, not self-service. See the [GMO Sign Help Center](https://helpcenter.gmosign.com/).
2. GMO Sign support issues a **Customer ID** (`cus_id`) and **Secret Key** (`secret_key`), plus your account-specific **API host** (`accessUrl`, e.g. `secure.gmosign.com`).
3. Enter the Customer ID, Secret Key, and API host on the OpenSteward Connect Link credential form.

There is no OAuth flow — `getAuthUrl` / `exchangeCode` throw. Authentication is performed per request: the client mints a short-lived `access_token` from `cus_id` + `secret_key` via `POST /agree-api/v0/api/accesstoken/generate`, then sends all three values in the JSON body of each call.

## Auth model

| Field | Stored on | Sent as |
| --- | --- | --- |
| Customer ID | `credentials.extra.cusId` | `cus_id` |
| Secret Key | `credentials.accessToken` | `secret_key` |
| API host | `credentials.extra.accessUrl` | request host |
| Access token | minted per client instance | `access_token` |

Every response is the `{ status, result, message }` envelope; `status: "0"` means success and the client unwraps `result`.

## Webhooks

GMO Sign delivers "Connect" status-change hooks on signature completion, but publishes no signature-verification scheme for them, so no webhook verifier is wired in this adapter.

## Refused fields

- Document content (`/document/getAll` returns the file body; it is intentionally never called — the canonical `Document` carries metadata only)
- Signature images
- Identity-verification (KYC) attachments

These are not on the canonical schema. The adapter never requests them.
