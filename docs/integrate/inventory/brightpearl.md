---
vertical: inventory
platform: brightpearl
title: Integrating Brightpearl
auth_type: oauth2
partner_program: true
estimated_time: 30min
last_verified: 2026-05-23
written_by: claude
---

# Brightpearl

Brightpearl by Sage is a retail-operations platform with strong inventory + order management for omnichannel merchants. The adapter wraps the Brightpearl REST API and surfaces products, warehouses, stock levels, suppliers, and stock corrections into the canonical inventory schema.

## Auth model

- **OAuth 2.0 Authorization Code grant.** Datacenter-prefixed: authorize at `https://oauth.brightpearl.com/authorize/{account}` (the user picks the account; Brightpearl redirects to the correct DC). Exchange via POST to `https://oauth.brightpearlapp.com/token/{account}` (`application/x-www-form-urlencoded`).
- The token response includes `api_domain` (e.g. `ws-eu1.brightpearl.com`) — every subsequent API call must use that host.
- Look up the datacenter ahead of time via the **Account Location API** (`GET https://api.brightpearl.com/public-api/{account}`) which returns the DC code and login / OAuth URLs.

## Prerequisites

1. A Brightpearl account at [brightpearl.com](https://www.brightpearl.com). Test against your sandbox account; production lives on the same OAuth surface.
2. **Brightpearl App Store registration is required.** Sign a Brightpearl Developer Programme contract; once approved you receive `dev_ref` (client id-equivalent), `app_ref`, and a client secret. There is no self-serve OAuth-app registration.
3. Each install creates an **Integration Instance**; capture the `installation_instance_id` returned at token-exchange time for later recovery flows.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **Brightpearl**.
2. Fill **Configure**:
   - `clientId` — your Brightpearl `dev_ref` / `app_ref`.
   - `clientSecret` — your Brightpearl app secret.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/inventory/brightpearl/callback`.
3. Enable the adapter. The first OAuth round-trip records the user's `account` code and `api_domain`.

## Required scopes

Brightpearl scopes are declared in the app manifest you submit to Brightpearl during programme onboarding rather than at runtime. Request the minimum set covering products, warehouses, stock, suppliers, and stock-correction read/write.

## Webhooks

Brightpearl emits webhooks for product, order, and stock events. Configure subscriptions via the integration UI or the Webhook API; deliveries are signed with an HMAC-SHA256 header (`pearl-webhook-signature`, hex) using a per-app secret. The adapter verifies the signature against the raw body.

Subscribe at minimum to `goods-in.created`, `goods-out.received`, `product.modified`, and `stock-correction.created` to keep the canonical schema fresh.

## Quirks worth knowing

- **App Store membership is mandatory.** No self-serve credentials. Onboarding generally takes 2-4 weeks.
- **Datacenter-pinned URLs.** Three things vary by DC: the OAuth host, the API host (`api_domain`), and the streaming host. Never hardcode.
- **Form-urlencoded token exchange.** Brightpearl rejects JSON bodies on the token endpoint, and snake_cases the response keys (unlike the rest of the API which is camelCase).
- **Instance recovery.** If you lose a token, supply `previous_instance_id` + `previous_access_token` on token exchange to recover the existing install (instances created before Jan 2018 cannot be recovered).

## References

- [OAuth Token POST](https://api-docs.brightpearl.com/utilities/oauth-token/post.html)
- [OAuth Token Introspection](https://api-docs.brightpearl.com/utilities/oauth-token-introspect/post.html)
- [Brightpearl API docs](https://api-docs.brightpearl.com/)
