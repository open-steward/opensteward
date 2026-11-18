# Sproof Sign adapter

sproof Sign REST API (https://sign.sproof.com/api/v1) → canonical docsign schema.
Spec: https://sign.sproof.com/api/v1/documentation/json

## EU residency

Sproof is an Austrian eIDAS-qualified trust service provider. Use for
Austrian- and EU-resident customers requiring QES with EU data
residency.

## Onboarding

The API key comes with an enterprise plan: "The key can be found in the
settings page of the administrator profile" (spec, Authentication). The
Connect Link form collects it; the adapter stores it as
`credentials.accessToken` and sends it on every call as the `token` query
parameter. `getAuthUrl()` throws: sproof has no interactive OAuth flow.

## Resources

- Envelope: one `_Document`, from GET /documents (`page` + `perPage`),
  keyed by the owner's member id and read back by GET /documents/{memberId}.
- Signer: `_Document.members`, paged locally.
- Document: the one file of a `_Document`.
- Template: GET /documents?view=templates.
- Audit trail: refused (501). Both audit endpoints return a PDF:
  GET /documents/{memberId}/pdfAuditTrail ("Binary PDF audit trail file")
  and GET /documents/{memberId}/fda ("Base64 encoded PDF audit trail").

## Webhooks

The spec documents no webhook signature scheme and no webhook event
payload. Its only callback is `_Document.callbackUrl`: "A post request
including the document will be sent to this Url when a new signature is
created". `webhook.ts` (an `X-Sproof-Signature` HMAC check and
`signature_request.*` events) predates this and is not backed by the spec.

## Refused fields

- Document content
- Per-signer handwritten / biometric signature images
- Stroke and pressure data captured during signing
