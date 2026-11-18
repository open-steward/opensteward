---
vertical: payments
platform: razorpay
title: Integrating Razorpay
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Razorpay

India-focused full-stack payments — UPI, netbanking, cards, wallets, EMI, subscriptions, invoicing, payouts.

## Auth model

> **`raw` is opt-in.** The upstream payload is withheld unless an operator enables `data_store.raw_payload.payments` in **Admin → Settings → Data store**. It is off by default because across the payments adapters it declares bank account numbers, IBANs and card numbers the canonical schema does not expose.

`api_key` (Basic-auth derived from `key_id:key_secret`). Submit both via the Connect Link form; the adapter base64-encodes them.

## Configure in admin

1. Sign in at https://dashboard.razorpay.com.
2. **Settings → API Keys → Generate Key**. Copy `Key ID` (`rzp_live_…` or `rzp_test_…`) and the secret.
3. Open `/platforms` → Payments → Razorpay → **Configure** and submit:
   - `keyId`
   - `keySecret`

## Webhooks

Set up at **Settings → Webhooks**. Subscribe to:

- `payment.*`, `refund.*`
- `subscription.*`, `invoice.*`
- `payout.*`
- `dispute.*` (where enabled)

Razorpay signs deliveries with `X-Razorpay-Signature` (HMAC-SHA-256 of the raw body with the webhook secret).

## Quirks

- **Money in minor units already** (`amount: 50000` for ₹500.00). The adapter passes amounts through unchanged.
- **`created_at` is a Unix timestamp** (seconds). The adapter converts to ISO-8601 RFC 3339.
- **PaymentMethod stays raw.** Razorpay's tokenisation flow follows RBI compliance rules — saved card semantics differ from Western gateways and the canonical schema doesn't model them.
- **Disputes (chargebacks) only on live keys with sufficient volume** — test keys won't see them.

## References

- API reference: https://razorpay.com/docs/api/
- Webhooks: https://razorpay.com/docs/webhooks/
- Subscriptions: https://razorpay.com/docs/api/payments/recurring-payments/subscriptions/
