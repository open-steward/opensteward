---
vertical: payments
platform: adyen
title: Integrating Adyen
auth_type: api_key
partner_program: false
estimated_time: 20min
last_verified: 2026-05-15
written_by: matt
---

# Adyen

Adyen Checkout / Management API — global enterprise gateway with strong alt-method coverage.

## Auth model

> **`raw` is opt-in.** The upstream payload is withheld unless an operator enables `data_store.raw_payload.payments` in **Admin → Settings → Data store**. It is off by default because across the payments adapters it declares bank account numbers, IBANs and card numbers the canonical schema does not expose.

`api_key`. Submit an API key from your Adyen Customer Area along with the merchant account name. The adapter sends `X-API-Key: <key>` on every request.

## Configure in admin

1. In the Adyen Customer Area, go to **Developers → API credentials → Web service user**, generate a new API key, and grant it the roles you need (Checkout webservice role + Management API role at minimum).
2. Note the merchant account (e.g. `YourCompanyECOM`).
3. Open `/platforms` → Payments → Adyen → **Configure** and submit:
   - `apiKey`
   - `merchantAccount`
   - `baseUrl` — test = `https://checkout-test.adyen.com`; live = your live prefix from the Customer Area (each Adyen account has a unique live host).

## Webhooks

Adyen delivers **standard webhook notifications** as batched HMAC-signed payloads. Configure them at **Developers → Webhooks → Standard Notification**:

- URL: `https://${PUBLIC_BASE_URL}/webhooks/adyen`
- Method: JSON
- HMAC key: generate and store as the webhook secret on the adapter

The adapter verifies each item's `hmacSignature` field against the configured key.

## Quirks

- **No bulk list endpoint.** Adyen doesn't expose `GET /payments` — the canonical pattern is "webhook-first": consume notifications, look up by `pspReference` on demand via `getCharge`.
- **`pspReference` is the gateway ID.** Used as `externalId` everywhere — long-running operations chain off it.
- **Subscriptions surface as `RecurringContract`**, not a first-class Subscription resource. The adapter does not normalise them into a canonical Subscription resource; enable and inspect `raw` if you need the `RecurringContract` details.
- **Tax + alt methods.** Adyen normalises hundreds of payment methods server-side; if you need the local-method detail (iDEAL, BLIK, Boleto …), inspect `raw.paymentMethod`.

## References

- API explorer: https://docs.adyen.com/api-explorer/
- Payment methods overview: https://docs.adyen.com/payment-methods/
- Webhooks (HMAC signature verification): https://docs.adyen.com/development-resources/webhooks/secure-webhooks/verify-hmac-signatures
