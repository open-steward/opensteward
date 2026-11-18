# e-Signature.eu adapter

e-Signature.eu REST signature API → canonical docsign schema.

Base URL: `https://www.e-signature.eu/wp-json/signature`

## EU residency

e-Signature.eu is an EU eIDAS electronic-signature provider offering
qualified (QES, via itsme® / Evrotrust), advanced (AES, via Veriff) and
simple (SES, via OTP email) signature levels. Use for EU-resident
customers requiring eIDAS-compliant signatures.

## Onboarding

1. Create an e-Signature.eu account.
2. In the dashboard under Settings > API, copy the API key and the
   numeric user ID.

The Connect Link form collects both. The adapter stores the API key as
`credentials.accessToken` (sent on every call as the `x-api-key` header)
and the user ID on `credentials.extra.userId` (sent as the mandatory
`userid` query parameter).

`getAuthUrl()` throws — e-Signature.eu has no interactive OAuth flow.

## Mapping

- Signature request → `Envelope` (`id_sign`, `status_id`, `doc_name`)
- `signers` object map (keyed by signing position) → `Signer`
- The single attached PDF → `Document` (metadata only)

Status: `pending` → sent, `finished` → completed, `skipped` /
`cancelled` / `deleted` → voided.

## Not implemented

- Templates — the platform exposes no templates endpoint.
- Audit-trail entries — no queryable history endpoint.
- Webhooks — callbacks are delivered but carry no signature/HMAC, so no
  verification handler is exposed.

## Refused fields

- Document content (`pdf_file_base64` is never surfaced)
- Per-signatory signature images and biometric data
- eID attributes beyond the verified first/last name
