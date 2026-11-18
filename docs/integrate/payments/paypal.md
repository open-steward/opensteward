---
vertical: payments
platform: paypal
title: Integrating PayPal
auth_type: oauth2_cc
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# PayPal

PayPal Payments REST API — wallets, subscriptions, invoicing, payouts, disputes.

## Auth model

> **`raw` is opt-in.** The upstream payload is withheld unless an operator enables `data_store.raw_payload.payments` in **Admin → Settings → Data store**. It is off by default because across the payments adapters it declares bank account numbers, IBANs and card numbers the canonical schema does not expose.

OAuth2 **client credentials** (`oauth2_cc`). Submit `clientId` + `clientSecret` from a REST API app in https://developer.paypal.com/dashboard/applications/sandbox. The adapter exchanges them for a 9-hour bearer at `/v1/oauth2/token` and refreshes on demand.

## Configure in admin

1. Create a REST API app at https://developer.paypal.com → **Apps & Credentials**.
2. Open `/platforms` → Payments → PayPal → **Configure**.
3. Submit:
   - `environment` — `live` or `sandbox`
   - `clientId`
   - `clientSecret`

## Webhooks

Create a webhook in the same dashboard, point it at `https://${PUBLIC_BASE_URL}/webhooks/paypal`, and subscribe to the events you care about — typically:

- `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`
- `BILLING.SUBSCRIPTION.{ACTIVATED,CANCELLED,SUSPENDED}`
- `INVOICING.INVOICE.PAID`
- `CUSTOMER.DISPUTE.{CREATED,RESOLVED}`

Signature verification uses the `Webhook ID` plus the `Paypal-Transmission-Sig` / `Paypal-Cert-Url` headers. PayPal's Verify Webhook Signature endpoint must be reachable from the integration server.

## Quirks

- **Decimal money.** PayPal returns decimal strings (`"10.50"` USD). The adapter multiplies by 100 and rounds to minor units. Watch for exotic currencies (JPY, KRW) where minor units == whole units.
- **No global "list customers" endpoint.** Customer records are derived from payer details on individual orders; the adapter leaves `listCustomers` empty.
- **PaymentMethod stays raw.** PayPal funding instruments (PayPal balance, card-on-file, BNPL) don't have a stable canonical mapping; consume `raw` if you need them.
- **Subscriptions live under `/v1/billing/subscriptions`** — fetch by ID; there's no full enumeration without webhook-derived index.

## References

- Payments v2: https://developer.paypal.com/docs/api/payments/v2/
- Subscriptions: https://developer.paypal.com/docs/api/subscriptions/v1/
- Invoicing: https://developer.paypal.com/docs/api/invoicing/v2/
- Webhook signature verification: https://developer.paypal.com/api/rest/webhooks/rest/
