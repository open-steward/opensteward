# Icertis adapter

Icertis Contract Intelligence (ICI) REST API → canonical docsign schema. ICI
is a Contract Lifecycle Management platform; its signing surface lives on the
Agreement entity.

Mapping: agreements → envelopes, signatories (internal + external) → signers,
associated documents / versions → documents (metadata only), ICI templates →
templates.

Auth: Microsoft Entra ID (Azure AD) authorization-code OAuth2. JWT Bearer
token, audience `api://<clientId>`, scope `api://<clientId>/.default`. Per-tenant
gateway host (`instanceUrl`, e.g. `https://api-in1.icertis.com`) and the
`ici-product-key` subscription key are configured out-of-band and stored on
`credentials.extra`. `ICERTIS_CLIENT_ID` / `ICERTIS_CLIENT_SECRET` /
`ICERTIS_TENANT_ID` env vars.

Pagination: `page` (1-based) + `pageSize` (max 100). Response metadata:
`TotalRowCount`, `TotalNumberOfPages`, `hasMoreData`.

Not implemented (router returns 501): audit-trail entries (no public signing-
audit event API) and webhooks (no publicly documented signed-payload contract).

Refused: document content, signature images, executed contract bodies.
