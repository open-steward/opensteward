# EidEasy adapter

EidEasy REST API → canonical docsign schema. Italian eIDAS QTSP. Static API key (Bearer).

Webhook: HMAC-SHA256 in `X-EidEasy-Signature` (hex).

Refused: document content, signature images, qualified certificate payloads.

## Read methods refuse (501 NOT_SUPPORTED)

eID Easy's API reference (https://documenter.getpostman.com/view/3869493/Szf6WoG1,
32 requests) has no list call and none of the `/api/transactions*` or
`/api/templates` paths this adapter used to call. Every list/get method for
envelopes, signers, documents, audit-trail entries and templates now refuses
before sending a request:

- signers and pending files come only from `GET /api/signatures/signing-queues/{id}`,
  which is authorized with a per-queue `Bearer {signing_queue_secret}`
  (https://docs.eideasy.com/multisigning/), not the account API key;
- the audit trail is a single PDF from `POST /api/signatures/download-audit-trail`;
- there is no template resource.

`voidEnvelope` still posts to `/transactions/{id}/cancel`, which is not in the
reference either; it is a write method and was left for a separate change.
