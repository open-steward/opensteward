---
vertical: payments
platform: worldpay-fis
title: Integrating Worldpay (FIS)
auth_type: oauth2_cc
partner_program: false
estimated_time: 20min
last_verified: 2026-05-15
written_by: matt
---

# Worldpay (FIS)

Enterprise EMEA + global card gateway under FIS. Two API surfaces co-exist:

1. **Worldpay Access REST API** — modern JSON. What this adapter uses.
2. **Worldpay Corporate Gateway (SOAP)** — legacy XML over POST. Used by long-running merchants on Worldpay Business Gateway. **Not supported by this adapter.**

## Auth model

Either:
- **HTTP Basic** (username + password from the Worldpay portal), or
- **OAuth 2.0 client-credentials** (Worldpay for Platforms; partner-program-gated).

The adapter accepts either set on the Connect Link form; submit one or the other.

## Required adapter quirks

- **Versioned media type.** Every request asks for `application/vnd.worldpay.payments-v7+json`. Bump in `constants.ts` after re-testing.
- **Try host** (`try.access.worldpay.com`) is the developer playground — sandbox-of-the-sandbox. Use it for early integration; flip to `access-uat.worldpay.com` for full UAT, then `access.worldpay.com` for live.
- **`outcome` ≠ `lastEvent`.** Worldpay reports a high-level `outcome` plus a stream of state-transition events. The adapter maps `outcome` first, falling back to `lastEvent` for derived state.

## Webhooks

Configure notifications under **Webhooks** in the Access dashboard. HMAC-SHA-256 of the raw body keyed with the webhook secret; the signature ships in `Worldpay-Webhook-Signature` as `v1=…`.

## References

- Access platform overview: https://docs.worldpay.com/access/products/access
- Payments API reference (OpenAPI): https://docs.worldpay.com/access/products/payments/openapi
- Events / webhook notifications reference: https://docs.worldpay.com/access/products/events/openapi
- API catalogue (all Access products): https://docs.worldpay.com/access/apis
- Legacy SOAP gateway (not supported by this adapter): https://developerengine.fisglobal.com/apis/wpg
