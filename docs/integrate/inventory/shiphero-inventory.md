---
vertical: inventory
platform: shiphero-inventory
title: Integrating ShipHero (Inventory)
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# ShipHero (Inventory)

ShipHero is a warehouse + fulfillment platform with a public GraphQL API. The adapter wraps ShipHero's Inventory queries + mutations and surfaces products, warehouses, bins, on-hand inventory, and inventory transactions into the canonical inventory schema.

## Auth model

- ShipHero exposes an **OAuth-style refresh-token flow** built on top of username + password authentication, not a hosted authorization-code redirect:
  - `POST https://public-api.shiphero.com/auth/token` with `username`, `password` → returns `access_token` (JWT bearer, ~28-day TTL) and `refresh_token`.
  - `POST https://public-api.shiphero.com/auth/refresh` with the refresh token → new access token.
- Scope string in the response is `openid profile offline_access`.
- All API calls hit `POST https://public-api.shiphero.com/graphql` with `Authorization: Bearer <token>`.
- There is **no hosted consent screen**; the connecting user supplies their ShipHero credentials directly to your integration. Plan UX (and trust) accordingly.

## Prerequisites

1. A ShipHero account at [shiphero.com](https://shiphero.com).
2. A dedicated **API user** in the ShipHero account (Settings → User Accounts). Never reuse a human's credentials — create a service user, assign warehouse + inventory roles only, store its credentials.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **ShipHero**.
2. Fill **Configure**:
   - `username` — the ShipHero API user's email.
   - `password` — the ShipHero API user's password.
3. Enable the adapter. The adapter exchanges these for the JWT pair and stores the refresh token; the password is not retained after the first exchange.

## Required scopes

ShipHero does not expose per-scope OAuth grants. The effective permissions come from the **role** assigned to the API user in ShipHero. Lock that role down to Inventory + Warehouse + Products only.

## Webhooks

ShipHero delivers JSON webhooks for inventory + shipment events. Configure under **Settings → Webhooks** (or via the GraphQL `webhook_create` mutation). Subscribe to:

- `Inventory Update`
- `Inventory Change` (per-warehouse on-hand deltas)
- `PO Update`
- `Shipment Update` (for outbound impact on on-hand)

Webhook signature semantics are not formally documented; the adapter expects an HMAC-SHA256 in the `x-shiphero-hmac-sha256` header (base64) when you configure a shared secret. Confirm the exact header with ShipHero support if HMAC verification fails.

## Quirks worth knowing

- **Username + password exchange, not OAuth Auth Code.** Treat ShipHero credentials with the same care as a service-account password — there is no hosted consent.
- **Always use a dedicated API user.** Re-using a real employee's account leaks all of their permissions and breaks when they offboard.
- **GraphQL throttling is cost-based.** Each query costs a number of points; the API returns `complexity` + `remaining` in the response — the adapter back-pressures on these.
- **Refresh proactively.** Access tokens are long-lived (~28 days) but refreshing weekly avoids cliff-edge auth errors during long sync jobs.

## References

- [ShipHero developer resources](https://developer.shiphero.com/getting-started/)
- [How to obtain API access + refresh tokens](https://software-help.shiphero.com/hc/en-us/articles/4419362224781-How-to-Obtain-API-Access-Refresh-Tokens)
- [ShipHero public GraphQL API](https://shipheropublic.docs.apiary.io/)
