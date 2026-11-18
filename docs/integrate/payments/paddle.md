---
vertical: payments
platform: paddle
title: Integrating Paddle
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Paddle

Merchant-of-record (MoR) for SaaS — Paddle is the legal seller. It handles VAT / sales-tax computation, collection, and remittance across 200+ jurisdictions; the merchant gets a single payout net of tax + Paddle fee.

## Auth model

Bearer-token. Generate an API key under **Developer Tools → Authentication** in the Paddle dashboard. Sandbox + live use different keys against different hosts (`sandbox-api.paddle.com` vs `api.paddle.com`).

## Required adapter quirks (read this!)

- **`Charge.amount` is gross-of-tax.** What the customer paid — the canonical convention for merchant-of-record adapters. `Invoice.tax` carries the VAT / sales-tax that Paddle remits on the merchant's behalf. **Net-to-merchant** = `total - tax - paddle_fee`, computed downstream if the consumer needs it.
- **`Charge.gateway = 'paddle'`.** Same biller convention as Chargebee / Recurly. `metadata.processor` is typically unset (Paddle abstracts the underlying processor entirely — the merchant doesn't pick one).
- **Money is integer minor units as strings.** Paddle returns `{ amount: "1000", currency_code: "USD" }` = $10.00. The adapter parses the string to an integer. JPY / KRW (zero-decimal currencies) work correctly.
- **Transactions double as invoices.** Paddle Billing's `Transaction` resource carries both the payment and the invoice data; the adapter surfaces it through both `Charge` and `Invoice` routers. Don't be surprised if `Charge.id == Invoice.id`.

## Webhooks

Configure under **Developer Tools → Notifications**. HMAC-SHA-256 of `${timestamp}:${rawBody}` keyed with the endpoint secret; signature ships in `Paddle-Signature` as `ts=…,h1=…`.

## References

- API reference: https://developer.paddle.com/api-reference/overview
- Webhooks + signature verification: https://developer.paddle.com/webhooks/signature-verification
- Merchant of Record overview: https://www.paddle.com/blog/what-is-merchant-of-record
