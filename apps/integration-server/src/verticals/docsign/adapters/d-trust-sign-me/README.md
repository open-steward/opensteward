# D-Trust sign-me adapter

D-Trust sign-me REST API → canonical docsign schema. German eIDAS QTSP — Bundesdruckerei subsidiary. Strong public-sector + financial-services usage.

OAuth2 + REST, unverified: no API reference is published, and neither `api.sign-me.de` nor the
OAuth host `login.sign-me.de` resolves, so the connect flow and scopes are undocumented.
`D_TRUST_SIGN_ME_CLIENT_ID` / `D_TRUST_SIGN_ME_CLIENT_SECRET` env vars.

Webhook: HMAC-SHA256 in `X-Sign-Me-Signature` (hex).

Refused: document content, signature images, qualified certificate payloads.

## Reads refused

Every read method (envelopes, signers, documents, audit trail, templates, list and get) throws
501 `NOT_SUPPORTED` before sending a request. sign-me is a remote signature service; D-Trust's
API page (https://www.d-trust.net/en/solutions/sign-me-api) answers "Workflows and templates" for
a direct API connection with "Poss. yes (only if implemented in an integrated application or
specialised process)". The product sheet
(https://www.d-trust.net/files/dokumente/pdf/product_sheet_sign-me.pdf, p.2) is more direct:
"When sign-me is connected via an API (interface), the remote signature service then only
receives so-called hash values, which ensure uniqueness." No public API reference is published. The `https://api.sign-me.de/v1`
host the adapter used to call does not resolve. `voidEnvelope` (a write) is unchanged and still
posts to that unverified host.
