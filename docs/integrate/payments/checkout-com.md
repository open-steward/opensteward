---
vertical: payments
platform: checkout-com
title: Integrating Checkout.com
auth_type: oauth2_cc
partner_program: false
estimated_time: 10min
last_verified: 2026-05-15
written_by: matt
---

# Checkout.com

Enterprise card gateway with strong fraud, 3-D Secure 2, and global acquiring coverage.

## Auth model

OAuth 2.0 **client credentials** (`oauth2_cc`). Submit `clientId` + `clientSecret` via the Connect Link form. The adapter exchanges them at `https://www.checkout.com/docs/developer-resources/api/manage-api-keys/oauth-2-0-client-credentials` with `scope=gateway` and caches the resulting bearer.

## Configure in admin

1. Sign in to the Hub at https://www.checkout.com.
2. Go to **Developers → API keys**, copy the OAuth client ID + secret.
3. Open `/platforms` → Payments → Checkout.com → **Configure** and submit:
   - `clientId`
   - `clientSecret`

## Webhooks

Set up under **Workflows → Add workflow**. Point the URL at `https://${PUBLIC_BASE_URL}/webhooks/checkout-com`, set the signature key, and subscribe to:

- `payment_*` (captures, refunds, voids)
- `dispute_*`
- `payment_payout_*`

The adapter verifies the `cko-signature` header (HMAC-SHA-256 of the raw body with the configured secret).

## Quirks

- **No native Subscription / Invoice / Plan resource.** Recurring billing on Checkout.com is implemented client-side via stored card-on-file + scheduled charges. The router returns `501 NOT_IMPLEMENTED` for these endpoints.
- **`balance_transactions` is Reporting-side.** The adapter consumes the Financial Actions endpoint to back the canonical resource.
- **Live keys must be issued through your account manager.** Sandbox keys self-serve.

## References

- API docs root: https://www.checkout.com/docs
- Webhooks (signature verification): https://www.checkout.com/docs/developer-resources/webhooks
- Payments overview: https://www.checkout.com/docs/payments
