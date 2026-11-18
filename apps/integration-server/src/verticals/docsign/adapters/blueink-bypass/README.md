# Sphereon adapter (slug: `blueink-bypass`)

Sphereon eIDAS Signature REST API (VDX platform, `/eidas-signatures/v1`) →
canonical docsign schema.

## What this is

Sphereon's eIDAS Advanced Electronic Signature service is a cryptographic
signing-**primitive** API, not an envelope/recipient signing workflow. It
manages reusable signature **configurations** (a signature level + digest
algorithm + form/timestamp parameters) and the key providers / certificates
used to mint eIDAS-compliant X.509 signatures, plus action endpoints
(`POST /signatures/{input,digest,create,merge}`).

## Resource mapping

| Canonical resource | Sphereon | Status |
| --- | --- | --- |
| Template | `GET /configs`, `GET /configs/{configId}` | implemented |
| Envelope | — (no workflow surface) | 501 |
| Signer | — | 501 |
| Document | — | 501 |
| Audit-trail entry | — | 501 |

Only signature configurations are listable/gettable REST resources, so this
adapter implements `listTemplates` / `getTemplate` and leaves every other
canonical resource unimplemented (the router returns 501 Not Implemented).

## Onboarding

1. Provision access to the Sphereon VDX eIDAS Signature gateway.
2. Mint a bearer token from your OpenID/OAuth2 IAM with the
   `read:vdx_sign_config` and `read:vdx_sign_cert` scopes.

The Connect Link form collects the API token only; the adapter stores it as
`credentials.accessToken` and sends it on every call as
`Authorization: Bearer <token>`. Self-hosted deployments can override the
base URL via `credentials.extra.baseUrl`.

`getAuthUrl()` throws — there is no interactive OAuth redirect flow here.

## Webhooks

None. The eIDAS Signature REST API has no webhook/callback support, so no
webhook verification or parsing is wired.
