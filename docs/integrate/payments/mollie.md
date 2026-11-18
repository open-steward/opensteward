---
vertical: payments
platform: mollie
title: Integrating Mollie
auth_type: api_key
partner_program: false
estimated_time: 5min
last_verified: 2026-05-15
written_by: matt
---

# Mollie

European multi-method gateway — iDEAL, Bancontact, SEPA, plus the usual card brands. Full canonical surface including mandates and chargebacks.

## Auth model

`api_key`. Submit a live key (`live_…`) or test key (`test_…`) via the Connect Link form. The adapter sets `Authorization: Bearer <key>` on every request.

## Configure in admin

1. Sign in at https://www.mollie.com/dashboard/.
2. Go to **Developers → API keys**, copy the live or test key.
3. Open `/platforms` → Payments → Mollie → **Configure** and submit:
   - `apiKey`

## Webhooks

Mollie uses **per-payment webhook URLs** — set the `webhookUrl` field on every `POST /v2/payments` to `https://${PUBLIC_BASE_URL}/webhooks/mollie`. The adapter looks up the payment by ID on receipt and re-fetches the canonical record.

There is no separate signing secret on Mollie — verification works by hitting the API with the same key, fetching the resource, and trusting the upstream record. Keep the webhook URL behind a hard-to-guess subpath if you want stronger isolation.

## Quirks

- **Decimal money + per-currency normalisation.** Mollie returns `{"value": "10.50", "currency": "EUR"}` in major units; the adapter multiplies by 100 + rounds to minor units. Watch JPY (`amount.value: "150"` already in whole yen).
- **Recurring is mandate-driven.** Customers must have a `Mandate` before subscriptions can be created. The adapter surfaces them through the `PaymentMethod` resource (`type: 'mandate'`).
- **No native Plan resource.** Subscription `amount`, `interval`, and `description` live inline on each `Subscription`.
- **Disputes are called "chargebacks"** at the API layer. The adapter normalises them to the canonical `Dispute` resource.

## References

- API reference: https://docs.mollie.com/reference/v2/payments-api/overview
- Webhooks: https://docs.mollie.com/docs/webhooks
- Mandates: https://docs.mollie.com/reference/v2/mandates-api/overview
