---
vertical: payments
platform: klarna
title: Integrating Klarna
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-15
written_by: matt
---

# Klarna

BNPL leader across EMEA + US — Pay Now, Pay in 30, Pay in 4, and Financing. Klarna routes API traffic to **regional clusters** (`api.klarna.com`, `api-na.klarna.com`, `api-oc.klarna.com`), each with its own playground host. Pick the region your Merchant Portal API keys belong to.

## Auth model

> **`raw` is opt-in.** The upstream payload is withheld unless an operator enables `data_store.raw_payload.payments` in **Admin → Settings → Data store**. It is off by default because across the payments adapters it declares bank account numbers, IBANs and card numbers the canonical schema does not expose.

HTTP Basic, username + password from the Klarna Merchant Portal under **Settings → API credentials**. Submit via the Connect Link form along with the region.

## Required adapter quirks

- **Installments live outside the canonical schema.** Klarna's order carries the full instalment schedule + APR; the canonical `Charge.amount` exposes the **principal only**. Consumers who need instalments must drop down to `Charge.raw`.
- **No bulk-list endpoint.** Klarna doesn't expose `GET /orders` over its merchant API. The adapter surfaces orders via webhooks plus `getCharge` by `order_id`.
- **Partial captures** map to `Charge.status = 'partially_refunded'` (the canonical schema lacks a dedicated `partially_captured` state).

## Webhooks

Configure under **Push notification URLs** on each merchant ID. HMAC-SHA-256 of the raw body keyed with the shared secret, hex-encoded in `Klarna-Signature`.

## References

- API reference: https://docs.klarna.com/api/
- Order Management: https://docs.klarna.com/api/ordermanagement/
- Klarna docs home: https://docs.klarna.com/
