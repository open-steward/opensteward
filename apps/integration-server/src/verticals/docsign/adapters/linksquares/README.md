# LinkSquares adapter

LinkSquares Finalize REST API → canonical docsign schema. Contract-lifecycle-management platform; the docsign vertical maps onto the Finalize product.

- API base: `https://api.linksquares.com/api/finalize/v2` (single hosted environment; sandbox vs prod is chosen by which API key is used).
- Auth: long-lived API key on the `x-api-key` header. No OAuth, no refresh. Collected via the shared `simpleApiKey` Connect Link form.
- Pagination: agreements and templates take 1-indexed `page` + `per_page`. Agreement versions document no query parameters; their pages chain through `_links.next.href` ("URL to the next page of items (null if none)"), which the adapter follows and cuts to the caller's page with `pageByRows`.

Resource mapping:

- Envelope ← Finalize agreement (`GET /agreements`, `GET /agreements/{id}?include=embedded`)
- Document ← agreement version (`GET /agreements/{agreement_id}/agreement_versions`; metadata only — content refused). Id `<agreementId>:<versionId>`.
- Template ← request-form templates (`GET /templates`, `GET /templates/{id}`)

Not implemented (auto-501): `voidEnvelope` (no documented cancel/void agreement endpoint).

Refused (501 NOT_SUPPORTED, no request sent): signers (the OpenAPI documents no party/signer resource; an agreement's `_embedded` holds only users, questions, token_values and statuses) and audit-trail entries (no activity-log endpoint).

No webhook handler: LinkSquares does not document an HMAC signature scheme for webhook deliveries.

Refused: document content, signature images, version file bodies.
