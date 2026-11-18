---
vertical: payments
platform: mercado-pago
title: Integrating Mercado Pago
auth_type: oauth2
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Mercado Pago

LatAm-focused payments + wallet (subsidiary of MercadoLibre). Primary in AR, BR, MX, CL, CO, UY.

## Auth model

Long-lived access token (`api_key`-style). OAuth (`oauth2`) is also supported for marketplace integrations but the access-token path is the canonical operator path.

## Configure in admin

1. Sign in at https://www.mercadopago.com/developers/panel.
2. **Your applications → Credentials**, copy either the test or production access token.
3. Open `/platforms` → Payments → Mercado Pago → **Configure** and submit:
   - `accessToken`

## Webhooks

Configure under **Notifications → Webhooks**. Point at `https://${PUBLIC_BASE_URL}/webhooks/mercado-pago` and subscribe to:

- `payment`
- `subscription_preapproval`, `subscription_authorized_payment`
- `chargebacks`
- `merchant_order`

Mercado Pago signs deliveries with `x-signature` (HMAC-SHA-256 of `<id>;<timestamp>` with the secret).

## Quirks

- **Decimal money.** `transaction_amount` is a float in major units; the adapter multiplies by 100 and rounds.
- **Status set is large.** `approved / pending / in_process / authorized / in_mediation / rejected / cancelled / refunded / charged_back`. The adapter folds them into the canonical `ChargeStatus`.
- **Subscriptions are called "preapprovals"** at the API layer. The adapter does not normalise the full preapproval lifecycle; fetching by ID returns the raw record.
- **Country-scoped currencies.** A single MP account is typically scoped to one country and currency; multi-country setups need one connection per country.

## References

- API reference: https://www.mercadopago.com/developers/en/reference
- Webhooks: https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks
- Preapprovals: https://www.mercadopago.com/developers/en/docs/subscriptions/landing
