---
vertical: docsign
platform: autenti
title: Integrating Autenti
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Autenti

Autenti is a Polish e-signature provider (SES + AES native, QES via Eurocert / PWPW partnerships) — one of the fastest-growing eIDAS-aligned signing platforms in CEE. The adapter wraps the Autenti Public API v2 and surfaces envelopes, signers, and audit-trail entries into the canonical docsign schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** for end-user-delegated access. Autenti adheres strictly to RFC 6749.
- API clients may also authenticate with their `client_secret` directly, or with a **signed JWT assertion** (private-key-signed) for higher-trust deployments.
- Sandbox and production environments use separate authorize / token URLs; both are surfaced in the Autenti developer portal once a client is provisioned.

## Prerequisites

1. An Autenti developer account at [developers.autenti.com](https://developers.autenti.com).
2. A registered API client. Autenti issues a **client ID** and **client secret** (and optionally provisions a JWT signing public key) and registers your redirect URI.
3. To go live in production you must request promotion from Autenti — sandbox credentials work against `app-sandbox.autenti.com`; production credentials are issued only after a brief integration review.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Docsign**, click **Autenti**.
2. Fill **Configure**:
   - `clientId` — from the Autenti developer portal.
   - `clientSecret` — from the Autenti developer portal.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/docsign/autenti/callback`.
   - `environment` — `sandbox` or `production`.
3. Enable the adapter.

## Required scopes

Autenti's scope catalogue is part of the developer-portal client configuration rather than a public list. Request scopes covering envelope creation, signer management, and audit-trail read — the developer portal exposes the exact strings.

## Webhooks

Autenti delivers signed webhook events for envelope lifecycle (sent, viewed, signed, declined, completed, expired). Each delivery is signed with HMAC-SHA256 in the `X-Autenti-Signature` header (hex). The adapter verifies against the raw body and the secret you configure per-subscription.

## Quirks worth knowing

- **QES requires a registered Autenti user identity.** Signers must complete a one-time identity proofing before they can apply a qualified signature; the adapter only initiates QES flows for identified signers.
- **Sandbox is isolated.** Production credentials never work against `app-sandbox`, and vice versa.
- **JWT-assertion clients have higher rate limits.** If you outgrow `client_secret` auth, ask Autenti to rotate you to JWT-bearer.

## References

- [Autenti authentication principles](https://developers.autenti.com/docs/autenti-public-api-v2/authentication)
- [Authorization code grant](https://developers.autenti.com/docs/autenti-public-api-v2/a7847a3b741c6-authorization-code-grant)
- [API client authentication](https://developers.autenti.com/docs/autenti-public-api-v2/authentication-api-clients)
