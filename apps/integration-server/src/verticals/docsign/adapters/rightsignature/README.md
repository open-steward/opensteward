# RightSignature adapter

RightSignature (Citrix RightSignature) REST API → canonical docsign schema.

## Onboarding

1. Sign in to your RightSignature account.
2. Open **Account → Developers** and create an OAuth application.
3. Register the OpenSteward redirect URI:
   `<base-url>/auth/docsign/rightsignature/callback`.
4. Default scopes: `documents:read documents:write templates:read`.

Set in `.env` of the integration-server:

```
RIGHTSIGNATURE_CLIENT_ID=...
RIGHTSIGNATURE_CLIENT_SECRET=...
```

## Resource model

RightSignature is single-document-per-envelope. Signers, the document's file
and its audit trail are not listed by any endpoint: all three are nested in
`GET /public/v1/documents/:id` (`recipients[]`, the document's own
`filename`, and `audits[]`), so the adapter reads that one response and
pages it locally.

Two shapes are borrowed from the v1 index's archived_documents
find_by_original_guid example, because the documents show example does not
write them out: the `audits[]` element (show has `"audits": []`), and the
recipient status `signed` (every recipient in show is `"pending"`; the
archived `signers[]` element has `"status": "signed"`). The raw status is
always kept in `metadata.status`. A missing recipient `name` or audit
`payload` is an error, not an empty string.

Not yet rebuilt: envelopes and templates still call `/documents` and
`/reusable_forms` without the documented `/public/v1` prefix, and the v1
index names the template resource `/public/v1/reusable_templates`.

## Webhooks

The adapter verifies the `X-RightSignature-Signature` header (HMAC-SHA256
of the raw body, hex-encoded). Both bare-hex and `sha256=<hex>` formats
are accepted.

## Refused fields

- Document content / signed-document URLs
- Signature images
- Identity-verification (KYC) attachments
