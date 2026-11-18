# Digio adapter

Digio REST API → canonical docsign schema. Digio is an Indian Aadhaar eSign aggregator and paperwork platform.

## Onboarding

1. Sign up at [digio.in](https://www.digio.in/developers).
2. From the dashboard, generate a `Client ID` and `Client Secret` pair.
3. In OpenSteward, run the Connect Link flow for `digio` and paste both values.

The adapter uses HTTP Basic auth: `Authorization: Basic base64(client_id:client_secret)`.

## Webhooks

Digio signs deliveries with HMAC-SHA256 in the `X-Digio-Signature` header (hex).

## Refused fields

- Document content / signed PDF download URLs
- Signature images
- Aadhaar eSign XML responses (eKYC, OTP, biometric payloads)
- eSign certificate bundles

## Refused resources

- Audit-trail entries. Digio's only documented audit trail,
  `GET /v2/client/document/{doc_id}/v2/audit_log` ("Download audit trail"),
  returns a PDF file, so `listAuditTrailEntries` / `getAuditTrailEntry` throw
  `501 NOT_SUPPORTED` without sending a request.

## Endpoints

- Signers and the document's metadata come from the documented
  `GET /v2/client/document/{docId}` ("Get Document Details",
  https://documentation.digio.in/swagger/get_getDocumentObject.json).
- The adapter calls the sandbox backend `https://ext.digio.in:444`. Digio's
  environments table lists `https://api.digio.in` as the production backend.
- Follow-up: `voidEnvelope` still posts to the unverified
  `/v3/client/document/{id}/cancel`. Digio documents the cancel as
  `POST /v2/client/document/{docId}/cancel` ("Cancel Sign request",
  https://documentation.digio.in/swagger/post_cancelSignRequest.json), which
  returns `ExternalDocDetails`. `listEnvelopes`, `getEnvelope` and the
  template methods are also still on unverified `/v3/client` paths.
