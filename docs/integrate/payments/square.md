---
vertical: payments
platform: square
title: Integrating Square
auth_type: oauth2
partner_program: false
estimated_time: 15min
last_verified: 2026-05-15
written_by: matt
---

# Square

Square Payments + Subscriptions + Invoicing across in-person POS and online checkout.

## Auth model

OAuth 2.0 (`oauth2`). Authorisation-code flow at `https://connect.squareup.com/oauth2/authorize`, exchange at `/oauth2/token`. Returns a short-lived access token (typically 30 days) plus a refresh token.

## Configure in admin

1. Create an application at https://developer.squareup.com/apps
2. Note `Application ID` (client ID) and **Production / Sandbox Application Secret** (client secret). Add your redirect URI.
3. Open `/platforms` → Payments → Square → **Configure** and submit `clientId`, `clientSecret`, and the matching `redirectUri`.

## Required scopes

Defaults requested by the adapter:

```
PAYMENTS_READ PAYMENTS_WRITE
CUSTOMERS_READ CUSTOMERS_WRITE
INVOICES_READ INVOICES_WRITE
SUBSCRIPTIONS_READ SUBSCRIPTIONS_WRITE
MERCHANT_PROFILE_READ
```

Override on a per-installation basis through the Connect Link's scope-group dropdown if you need a stricter set.

## Webhooks

Set up at **Webhooks** in the developer dashboard. Subscribe to `payment.*`, `refund.*`, `customer.*`, `invoice.*`, `subscription.*`, and `dispute.*`. Square signs deliveries with HMAC-SHA-256 over the URL + raw body using the subscription's signature key.

## Quirks

- **Idempotency keys required on every write.** The adapter generates a UUIDv4 per request via `node:crypto.randomUUID()`. Pass a custom one through `metadata.idempotencyKey` if you need cross-call idempotency.
- **Square-Version header** is pinned to `2024-09-19`. Bump in `client.ts` after re-testing.
- **POS-only resources** (Terminal, Bookings, Loyalty) are not covered by this adapter.

## References

- Square API reference: https://developer.squareup.com/reference/square/
- Developer docs (OAuth + Webhooks guides linked from the docs index): https://developer.squareup.com/docs/square-get-started
