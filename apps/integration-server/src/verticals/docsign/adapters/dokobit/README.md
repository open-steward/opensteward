# Dokobit adapter

Dokobit Portal API → canonical docsign schema. Docs: https://beta.dokobit.com/api/doc
(sandbox); production serves the same API at https://app.dokobit.com/api.

Auth: static API access token, sent as the `access_token` query parameter.

Reads:

- `listEnvelopes`: `GET /api/signing/list.json` (unpaged, paged locally), each row on
  the page completed from `GET /api/signing/{token}/status.json`.
- `getEnvelope`, `listSigners`, `listDocuments`, `getDocument`:
  `GET /api/signing/{token}/status.json` (signers and files inline, paged locally).
  A document id is `<signing token>:<index in files>`.

Refused (501 NOT_SUPPORTED, no request sent): audit trail entries and templates. The
Portal API documents no endpoint for either.

Not rebuilt: `voidEnvelope` still posts to `/signings/{id}/cancel`, which the Portal API
does not document.

Webhook: `webhook.ts` (unchanged by the list rebuild) verifies HMAC-SHA256 in
`X-Dokobit-Signature` and maps dotted actions (`signing.created`, ...). **Neither
is documented**: the Portal API documents postbacks with no signature header,
and its actions use underscores (`signing_created`, `signer_signed`,
`signer_approved`, `signer_declined`, `signing_completed`, `signing_archived`,
`signing_archive_failed`, `document_received`). Unverified; needs its own fix.

Signers with neither `first_name` nor `last_name` (both optional at create;
a signer may be identified by personal code alone) make the signer transform
throw, because the canonical `name` is required and has no other documented
source.

Refused: document content and download URLs, signer personal codes, signature
certificates.
