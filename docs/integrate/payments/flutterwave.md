---
vertical: payments
platform: flutterwave
title: Integrating Flutterwave
auth_type: api_key
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Flutterwave

Africa breadth — 30+ countries, methods spanning cards, mobile money, bank transfers, USSD, QR, M-Pesa, and Pay-by-Bank. Strong in West Africa; growing in East/Southern Africa.

## Auth model

Bearer-token from the merchant **Secret Key** — `FLWSECK_TEST-…` for test, `FLWSECK-…` for live. Generate under **Settings → API** in the Flutterwave dashboard.

## Required adapter quirks

- **Multi-currency settlement on one account.** Unlike Paystack, a single Flutterwave merchant can settle in multiple currencies (NGN + USD + GHS + KES + UGX + ZAR + …). Always read `Charge.currency` per row; don't assume an account-level default.
- **Decimal money.** Flutterwave returns `amount` as a float in major units — the adapter multiplies by 100. JPY / KRW are not in coverage so the simple ×100 is safe.
- **No top-level customer list.** Customers are derived from transactions. `listCustomers` returns empty; build a customer index from `Charge.customerId` or use the customer-search endpoint per-transaction.
- **`verif-hash` webhook header is the secret-hash itself, NOT an HMAC.** You configure a single shared string in the dashboard; Flutterwave echoes it verbatim on every delivery. Compare timing-safely (the adapter does).

## References

- API reference: https://developer.flutterwave.com/reference/
- Webhooks: https://developer.flutterwave.com/docs/webhooks
- Multi-currency settlement: https://developer.flutterwave.com/docs/settlements
