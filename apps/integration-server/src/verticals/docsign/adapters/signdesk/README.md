# SignDesk adapter

SignDesk (now Melento) REST API → canonical docsign schema. SignDesk is an Indian eSign + document-automation gateway (Aadhaar eSign / DSC) that groups documents and signatories into eSign requests.

## Onboarding

1. Get an account at [signdesk.com](https://signdesk.com/esign-api) (docs at [docs.melento.ai](https://docs.melento.ai/)).
2. From the dashboard API settings, copy your `Application ID` and `License Key`.
3. In OpenSteward, run the Connect Link flow for `signdesk`, paste both values, and pick the environment (production / sandbox).

The adapter sends `x-application-id` + `x-license-key` headers on every request (no `Authorization: Bearer`).

## Resources

- Envelopes — SignDesk eSign requests

Refused with 501 NOT_SUPPORTED before any request: signers, documents and audit-trail entries (list and get). They used to read `GET /api/esign/requests/{id}` and `GET /api/esign/requests/{id}/audit-trail`. No public first-party source documents either path ([docs.melento.ai](https://docs.melento.ai/) is behind an OTP login), and api.signdesk.in answers both with Express's route-level 404 "Cannot GET …" before any authentication. The audit-trail method also synthesised entries from request timestamps when that call failed; that fallback is gone.

Templates are not implemented — SignDesk exposes no listable template REST resource, so the router returns 501.

## Refused fields

- Signed-document content / base64 PDF / download URLs
- Audit-trail PDF blobs
- Aadhaar eSign XML responses (eKYC, OTP, biometric payloads)
- Signature images and DSC certificate bundles
