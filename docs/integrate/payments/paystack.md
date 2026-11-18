---
vertical: payments
platform: paystack
title: Integrating Paystack
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Paystack

Africa anchor (Stripe-owned but independent product). Strong in Nigeria + Ghana + South Africa + Kenya. Methods: cards, bank transfers, USSD, QR, mobile money.

## Auth model

Bearer-token (the merchant secret key — `sk_test_…` or `sk_live_…`). Generate under **Settings → API Keys & Webhooks** in the Paystack dashboard.

## Required adapter quirks

- **NGN settlement requires a Nigerian business.** The Paystack account must be incorporated in Nigeria to settle in NGN. Cross-border merchants typically settle in USD via a Paystack International account; mobile money in Ghana/Kenya needs separate KYC.
- **`amount` is in kobo / cents.** Integer minor units already — pass through unchanged.
- **Transaction-level currency.** Returned per row in `currency`. Multi-currency merchants should not assume NGN.
- **Customer dedupe.** Customers can be addressed by email (Paystack auto-creates if not present) or by `customer_code`. The adapter surfaces both — `externalId` = `customer_code` for stability across renames.

## Webhooks

Configure under **Settings → API Keys & Webhooks → Webhook URL**. HMAC-SHA-512 of the raw body keyed with the secret API key (same one used for API auth), hex-encoded in `x-paystack-signature`.

## References

- API reference: https://paystack.com/docs/api/
- Webhooks: https://paystack.com/docs/payments/webhooks
- Settlement guide: https://paystack.com/docs/payments/settlements
