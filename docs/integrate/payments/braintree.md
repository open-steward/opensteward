---
vertical: payments
platform: braintree
title: Integrating Braintree
auth_type: api_key
partner_program: false
estimated_time: 15min
last_verified: 2026-05-15
written_by: matt
---

# Braintree

Braintree (PayPal-owned) — subscription-heavy gateway with strong multi-currency support. Primary API is GraphQL.

## Auth model

Merchant credentials (Basic auth derived from `public_key:private_key`). Submit via Connect Link form; the adapter base64-encodes them as the bearer token.

## Configure in admin

1. Sign in at https://www.braintreegateway.com.
2. Go to **Account → My User → View Authorization** to see your `merchantId`, `publicKey`, and `privateKey`. Use the Sandbox dashboard for testing.
3. Open `/platforms` → Payments → Braintree → **Configure** and submit:
   - `environment` — `production` or `sandbox`
   - `merchantId`
   - `publicKey`
   - `privateKey`

## Webhooks

Configured under **Settings → Webhooks**. Braintree signs each delivery with a `bt_signature` query parameter; the adapter verifies it against the merchant's public key.

Subscribe to:

- `transaction_*` (charges)
- `subscription_*`
- `dispute_*`
- `disbursement_*` (payouts)

## Quirks

- **GraphQL-first.** Braintree's GraphQL surface is the canonical API; the legacy REST/SDK endpoints are wrappers. The adapter implements `getCharge` via GraphQL; `listCharges` is backed by webhook-derived sync.
- **Decimal money.** Transactions return `amount.value` as a decimal string in major units. The adapter converts to minor units.
- **`Braintree-Version` header** is pinned to `2019-01-01` — the most recent stable schema version at the time of writing.

## References

- Developer portal: https://developer.paypal.com/braintree/docs
- GraphQL reference: https://graphql.braintreepayments.com/reference/
- Webhooks: https://developer.paypal.com/braintree/docs/guides/webhooks/overview
