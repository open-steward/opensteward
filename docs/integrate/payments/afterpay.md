---
vertical: payments
platform: afterpay
title: Integrating Afterpay
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Afterpay

BNPL in the US, Australia, and New Zealand — Pay-in-4 and Pay Monthly. Block-owned (parent of Cash App).

## Auth model

> **`raw` is opt-in.** The upstream payload is withheld unless an operator enables `data_store.raw_payload.payments` in **Admin → Settings → Data store**. It is off by default because across the payments adapters it declares bank account numbers, IBANs and card numbers the canonical schema does not expose.

HTTP Basic from `merchantId:secretKey`. Region-specific hosts:

- US: `api.us-sandbox.afterpay.com` / `api.us.afterpay.com`
- AU/NZ: `api-sandbox.afterpay.com` / `api.afterpay.com`

Sandbox credentials are generated through the **Cash App developer portal** (Afterpay's sandbox lives under the broader Cash App developer tooling); live keys come from the Afterpay merchant dashboard.

## Required adapter quirks

- Same **installments-vs-principal** model as Klarna and Affirm — `Charge.amount` is the order principal; installment schedule lives in `raw`.
- **Capture is required.** Afterpay authorises at customer-confirm time, but merchants must explicitly call `captureCharge` (defer-shipping flow) before the auth expires (~24h depending on region).
- **`requestId` idempotency.** Every refund needs a unique request ID; the adapter generates `oi-<timestamp>` automatically.

## Webhooks

Configure in the merchant dashboard. HMAC-SHA-256 of the raw body keyed with the configured secret, hex-encoded in `Signature`.

## References

- Developer portal (entry point for Afterpay Online, Partner API, and Button docs): https://developers.afterpay.com/
