# Sirion adapter

SirionOne B2B API → canonical docsign schema. Sirion is an AI-native Contract
Lifecycle Management (CLM) platform; a SirionOne *contract* maps onto the
canonical envelope, with nested signatories (signers), attached files
(documents, metadata only), contract activity history (audit trail), and
reusable contract templates.

OAuth 2.0 client-credentials grant. A client admin mints an OAuth Client ID +
Client Secret under Admin 2.0 → OAuth Client Setup; these are exchanged for a
Bearer token at the tenant's `/oauth/token`. SirionOne is multi-tenant, so the
API host is per-connection and carried on `credentials.extra.baseUrl`
(e.g. `https://acme.sirion.ai`).

Pagination: page-number based (`page` + `size`), rows wrapped in `content`.

Read-only surface: envelopes (list/get), signers, documents, audit-trail
entries, templates. Contract termination + signature mutations are
governance-workflow driven and not exposed (auto-501).

No public webhook signature scheme is documented; no webhook verification is
provided.

Refused: document content / file binaries, signature images.

## Auth label and unverified details

`auth_type` is `session`: the Connect form collects the tenant `baseUrl`,
`clientId` and `clientSecret` per connection and exchanges them for a Bearer
token (`exchangeCredentials`). There is no browser redirect, so `oauth2` could
never complete a connect.

Sirion's API documentation (https://docs.sirion.ai) is login-gated: on
2026-09-28 it returned an access-denied notice asking the reader to log in to
the Sirion application. The token path (`OAUTH_TOKEN_PATH = '/oauth/token'`),
the scope (`DEFAULT_SCOPES = ['read']`) and the API prefix
(`API_PATH_PREFIX = '/b2b/v1'`) in `constants.ts` are therefore unverified
against vendor docs. Confirm them with a customer who has docs access.
