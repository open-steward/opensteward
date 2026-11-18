# LegalDesk adapter

LegalDesk ([legaldesk.com](https://legaldesk.com/what-are-esign-and-ekyc-api)) Aadhaar-based eSign / eKYC gateway → canonical docsign schema.

LegalDesk exposes a CCA eSign **transaction** API: create a transaction, attach one-or-more documents and a set of signers, and each signer authorises the signature with an Aadhaar OTP / biometric / iris mode. Status is polled and the completed signed document + audit trail are delivered to a configured callback.

Mapping:

| LegalDesk             | Canonical          |
| --------------------- | ------------------ |
| transaction           | `Envelope`         |

Signers, documents and audit-trail entries refuse with 501 `NOT_SUPPORTED` before any request is sent. LegalDesk's only first-party API page (https://legaldesk.com/what-are-esign-and-ekyc-api) documents no endpoint for them — it says "click the button below and submit your request" — so the `/v1/transactions/{id}` embedded arrays and `/v1/transactions/{id}/audit-trail` the adapter used to call could not be verified, and the audit trail it synthesised on error has been removed.

Templates are not implemented — the eSign transaction API has no listable template REST resource — so the router returns 501 for template reads.

## Onboarding

1. Sign in to the LegalDesk dashboard and open the **API** settings.
2. Generate an API key (production and sandbox issue separate keys).
3. In the OpenSteward Connect Link flow, paste the API key and pick the environment (production / sandbox).

There is no OAuth flow. Credentials are collected via `credentialFields()` + `exchangeCredentials()`; the API key is sent on every request as the `x-api-key` header.

## Sandbox vs production

Production and sandbox are distinct hosts (`api.legaldesk.com` vs `api-sandbox.legaldesk.com`), each issuing its own API key. The chosen host is stored on `credentials.extra.baseUrl`.

## Webhooks (callbacks)

LegalDesk delivers the completed signed document + audit trail to a configured callback. No public webhook signature-verification scheme is documented, so this adapter does not implement `verifyWebhook` / `parseWebhookEvents`; webhook handling is registered separately.

## Refused fields

- Signed-document content / base64 PDF / download URLs (`Document` is metadata only)
- Audit-trail PDF blobs
- Aadhaar eSign XML responses (eKYC / OTP / biometric payloads)
- Signature images and DSC certificate bundles

These are not on the canonical schema. The adapter never requests them.
