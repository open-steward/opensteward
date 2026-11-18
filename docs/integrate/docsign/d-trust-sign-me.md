---
vertical: docsign
platform: d-trust-sign-me
title: Integrating D-Trust sign-me
auth_type: oauth2
partner_program: true
estimated_time: 30min
last_verified: 2026-05-23
written_by: claude
---

# D-Trust sign-me

D-Trust sign-me is the remote-signature service operated by D-Trust GmbH (a Bundesdruckerei subsidiary), a German eIDAS qualified trust service provider. It covers SES, AES, and QES via remote signing keys held in D-Trust's secure environment, and is widely deployed across DE public-sector and financial-services workflows. The adapter wraps the sign-me REST API and surfaces signing transactions, signers, and audit data into the canonical docsign schema.

## Auth model

- **OAuth 2.0 Authorization Code grant**, brokered through D-Trust's identity service. Each signer authenticates against their D-Trust sign-me identity and approves signing scopes; second-factor confirmation happens on the signer's mobile device.
- Concrete `authorize` / `token` URLs, scope strings, and certificate-pinning requirements are issued per partner during onboarding — D-Trust does not publish a global self-service developer portal for sign-me API access.

## Prerequisites

1. A signed partner agreement with D-Trust GmbH. Contact `vertrieb@d-trust.net` (or +49 (0)30 2598-0) to request sign-me API access. Expect KYC / contracting before credentials are issued.
2. Each signer must have completed sign-me identity proofing (Video-Ident, eID, or branch identification) before they can apply AES or QES.
3. D-Trust assigns sandbox + production environments separately and pins your TLS client certificate.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Docsign**, click **D-Trust sign-me**.
2. Fill **Configure**:
   - `clientId` — issued by D-Trust during onboarding.
   - `clientSecret` — issued by D-Trust during onboarding.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/docsign/d-trust-sign-me/callback`.
   - `authUrl` / `tokenUrl` — provided in your partner documentation pack.
   - `environment` — `sandbox` or `production`.
3. Enable the adapter.

## Required scopes

Scope catalog is delivered as part of the partner documentation pack — sign-me does not expose it on the public website. Request the minimum scopes covering signing-transaction create / read and signer status events; production credentials must be requested separately from sandbox.

## Webhooks

sign-me callback mechanics are configured during onboarding. Where webhooks are available, deliveries are HMAC-signed against a shared secret you exchange with D-Trust. The adapter exposes a generic `X-Sign-Me-Signature` (hex SHA-256) verifier; confirm the exact header name in the partner docs.

## Quirks worth knowing

- **Partner contract required.** There is no self-serve API access. Production credentials are issued only after D-Trust's onboarding review.
- **eIDAS-bound identity.** The signer is the legal subject — your service account never signs on their behalf. Mis-modelling this is the most common compliance error.
- **PDF or hash submission.** sign-me accepts either a full PDF/A or just a precomputed hash; for confidentiality, prefer hash-only submission so the document never leaves your infrastructure.
- **German + English UI strings only.** Plan localisation accordingly for the signer flow.

## References

- [D-Trust sign-me overview](https://www.d-trust.net/en/solutions/sign-me)
- [sign-me API](https://www.d-trust.net/en/solutions/sign-me-api)
- [sign-me support](https://www.d-trust.net/en/support/sign-me)
