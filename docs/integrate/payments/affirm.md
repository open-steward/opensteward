---
vertical: payments
platform: affirm
title: Integrating Affirm
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Affirm

BNPL in the US — point-of-sale loans up to 36 months. Two API tiers (sandbox + live) with distinct keys.

## Auth model

> **`raw` is opt-in.** The upstream payload is withheld unless an operator enables `data_store.raw_payload.payments` in **Admin → Settings → Data store**. It is off by default because across the payments adapters it declares bank account numbers, IBANs and card numbers the canonical schema does not expose.

HTTP Basic from `public_api_key:private_api_key`. Generate both keys under **Settings → API keys** in the Affirm merchant dashboard.

## Required adapter quirks

- **Adaptive Checkout returns a token, not a charge.** The customer-facing flow yields a `checkout_token` client-side; the server authorises the loan with `POST /api/v1/charges` and then captures separately. Our `createCharge` covers the authorise step; call `captureCharge` (or let auto-capture handle it) to settle.
- **Charge.amount = loan principal.** Installment schedule, APR, and lender disclosures live on `Charge.raw` only.
- **`Charge.failureCode` carries the loan-decline reason.** Use it to surface the actual decline cause to the customer (not the raw 4xx).

## Webhooks

Configure in **Settings → Notifications**. Affirm signs with HMAC-SHA-256 keyed with the shared secret; hex-encoded in `X-Affirm-Signature`.

## References

- API reference (introduction): https://docs.affirm.com/developers/reference/introduction
- Developer docs root: https://docs.affirm.com/developers
