# Validated ID (VIDsigner) adapter

VIDsigner REST API v2.2 → canonical docsign schema.

## EU residency

VIDsigner is the e-signature product of Validated ID (Barcelona), an EU
eIDAS trust-service provider. Use for European customers requiring
biometric/remote/centralized signatures with EU data residency.

## Model mapping

VIDsigner has no separate "envelope": a signing job is a single document
with one or more signers.

- document (`DocumentInfoDTO`) → `Envelope` (`DocGUI` is the id)
- `Signers[]` (`SignerInfoDTO`) → `Signer`
- the document → a single `Document` (metadata only)

Endpoints used:

- `GET /documentinfo/{docGUI}` — full status + signers (evidence info)

## Onboarding

1. Get a VIDsigner subscription from Validated ID.
2. The Connect Link form collects the **environment** (Production or
   Pre-production), the **subscription user**, and the **subscription
   password**.

Auth is HTTP Basic: the adapter encodes `user:password` once and sends it
on every call as `Authorization: Basic <base64>`. The chosen environment
selects the base URL:

- production: `https://vidsignercloud.validatedid.com/api`
- pre-prod: `https://pre-vidsignercloud.validatedid.com/api`

`getAuthUrl()` throws — VIDsigner has no interactive OAuth flow.

## Not implemented

- `listEnvelopes` — refused with 501 before any request. The first-party
  VIDcloud spec (https://vidsignercloud.validatedid.com/3.0/swagger) documents
  the only listing, `GET /api/v{version}/documentlist/{id}` ("Returns a list of
  documents by specific type"; `id` is one of all, unsigned, rejected, signed,
  signeddownloaded, signednotdownloaded; paged by `paginationDTO.pageNumber` /
  `paginationDTO.pageSize`), but gives its 200 response only as
  `{ "type": "object" }`: no property holding the documents, no item schema,
  no total and no page base. Reading it would mean inventing that shape.
- `voidEnvelope` — no cancel endpoint in this API surface.
- Templates — VIDsigner has no template catalogue.
- Audit-trail entries — the audit evidence is a signed report PDF
  (document content), which the canonical schema refuses.
- Webhooks — VIDsigner uses a bare per-document `NotificationURL`
  callback with no documented signature scheme, so no verification is
  implemented.

These methods auto-return 501 Not Implemented at the router.

## Refused fields

- Document content (`DocContent`, base64 PDF) — never read.
- Signed report / evidence PDF — content, never read.
- Handwritten/biometric signature images — never reflected.
