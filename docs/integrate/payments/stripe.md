---
vertical: payments
platform: stripe
title: Integrating Stripe
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-15
written_by: matt
---

# Stripe

Stripe is the reference implementation for the payments vertical. It exposes the full canonical surface — customers, payment methods, charges, refunds, subscriptions, invoices + line items, payouts, disputes, plans, prices, products, balance transactions — and is the model every other payments adapter is measured against.

## Auth model

- **Stripe Connect (`oauth2`, recommended for multi-tenant SaaS).** Authorisation-code flow at `https://connect.stripe.com/oauth/authorize`, exchange at `https://connect.stripe.com/oauth/token`. Returns `access_token` + `refresh_token` + `stripe_user_id` (the connected account's `acct_…`).
- **Secret API key (`api_key`, single-merchant deploys).** Submit a `sk_live_…` or `sk_test_…` directly through the Connect Link form. The adapter will treat the key as the bearer token; no refresh is required.

## Prerequisites

1. A Stripe account at https://dashboard.stripe.com.
2. For Connect: register a Connect application under **Settings → Connect → Settings**. Note the `client_id` (`ca_…`), the platform secret key, and add your callback URL.
3. For direct API-key deploys: nothing — just copy the secret key from **Developers → API keys**.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Payments**, click **Stripe**.
2. Fill **Configure**:
   - `clientId` — your Connect `client_id` (skip for direct-API-key mode).
   - `clientSecret` — your platform secret key (`sk_live_…` or `sk_test_…`).
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/payments/stripe/callback`.
3. Enable the adapter. End-users then connect via `/connect-link` or your direct redirect.

## Required scopes

The default is `read_write`, which permits every API call against the connected account. Override per-installation if you need a stricter set; Stripe's permission model is coarse-grained at the Connect level, so most operators keep the default.

## Webhooks

1. Add an endpoint at `https://${PUBLIC_BASE_URL}/webhooks/stripe`.
2. Subscribe to:
   - `charge.*`, `payment_intent.*`
   - `customer.*`, `customer.subscription.*`
   - `invoice.*`, `invoiceitem.*`
   - `payout.*`
   - `charge.dispute.*`
3. Copy the signing secret (`whsec_…`) into the adapter's webhook secret setting.

The adapter verifies the `Stripe-Signature` header (HMAC-SHA256 of `${t}.${body}` with a 5-minute timestamp tolerance) and parses every event into a canonical `WebhookEvent`. Event types map to `{resourceType, action}` automatically — `charge.succeeded` → `{charges, succeeded}`, `invoice.finalized` → `{invoices, finalized}`, and so on.

## Sandbox / test mode

Use a test-mode secret key (`sk_test_…`) or a test-mode Connect application. Test-mode credentials issue the same token shape as live keys, and the adapter treats them identically — `livemode` is exposed in `credentials.extra.livemode` if you need to branch on it.

## Quirks worth knowing

- **Money is integer minor units.** Stripe always uses minor units (cents, paise, satoshi …); the adapter passes them through unchanged. No float conversion.
- **`customers.list_payment_methods` is customer-scoped.** Pass `?customer_id=cus_…` on `GET /v1/payments/payment_methods` — Stripe has no global "list all PaymentMethods" endpoint.
- **Cancellation semantics.** `POST /v1/payments/charges/:id/cancel` voids an uncaptured authorisation. Already-captured charges must be refunded via `POST /v1/payments/refunds`.
- **`atPeriodEnd` on subscription cancel** sets `cancel_at_period_end=true` instead of issuing the immediate-cancel `DELETE /subscriptions/:id`. Use it to honour the customer's remaining paid period.
- **Tier-2 coverage is first-class on Stripe.** Plans, Prices, Products, and BalanceTransactions are full transforms here — other adapters skip them.

## References

- Stripe API reference: https://docs.stripe.com/api
- Connect OAuth: https://docs.stripe.com/connect/oauth-reference
- Webhooks: https://docs.stripe.com/webhooks
- Webhook signatures: https://docs.stripe.com/webhooks/signatures
