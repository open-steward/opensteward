---
vertical: inventory
platform: shipbob-inventory
title: Integrating ShipBob (Inventory)
auth_type: oauth2
partner_program: false
estimated_time: 20min
last_verified: 2026-05-23
written_by: claude
---

# ShipBob (Inventory)

ShipBob is a 3PL fulfillment network with a developer-facing REST API. The adapter wraps ShipBob's Inventory endpoints and surfaces SKUs, inventory levels per fulfillment center, lots, and bins into the canonical inventory schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** (multi-merchant apps). Authorize at `https://auth.shipbob.com/connect/authorize`. Exchange via POST to `https://auth.shipbob.com/connect/token`.
- Sandbox uses `https://authstage.shipbob.com/connect/authorize` + `/connect/token`.
- Access tokens last `3600` seconds. Include `offline_access` in the scope set to receive a `refresh_token`.
- Single-merchant deploys may use a **Personal Access Token** (PAT) generated from the ShipBob dashboard instead.

## Prerequisites

1. A ShipBob merchant account at [shipbob.com](https://www.shipbob.com) (or sandbox).
2. Register an OAuth app under **Integrations → OAuth Apps → Create App**. Note the **Client ID** and **Client Secret**, and register the exact callback URL — ShipBob enforces strict redirect matching.
3. The connecting merchant must have access to the channel(s) you intend to read from; ShipBob scopes most data per `shipbob_channel_id`.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **ShipBob**.
2. Fill **Configure**:
   - `clientId` — from your ShipBob OAuth app.
   - `clientSecret` — from your ShipBob OAuth app.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/inventory/shipbob-inventory/callback`.
   - `environment` — `production` or `sandbox`.
3. Enable the adapter.

## Required scopes

For the canonical inventory surface request:

- `inventory_read`, `inventory_write`
- `products_read`, `products_write`
- `locations_read`
- `channels_read`
- `webhooks_read`, `webhooks_write`
- `offline_access` — required for refresh tokens.

(Drop the `_write` variants if the integration is read-only.)

## Webhooks

ShipBob delivers JSON webhooks for inventory + order events. Configure subscriptions via the Webhooks API or the dashboard. The adapter verifies the per-subscription HMAC-SHA256 signature in the `X-ShipBob-Hmac-Sha256` header (base64) against the raw body.

Subscribe to `inventory_quantity_changed`, `inventory_received`, and `product_updated` for the inventory surface.

## Quirks worth knowing

- **`shipbob_channel_id` is required on every call.** Inventory data is scoped per channel; the OAuth token alone is not enough — pass the channel header.
- **Sandbox is a separate host.** `authstage.shipbob.com` for OAuth, `sandbox-api.shipbob.com` for data — production tokens won't authenticate against sandbox.
- **Refresh requires `offline_access`.** Omit it and you'll be re-prompting users every hour.
- **PAT vs OAuth.** Single-merchant integrations can skip OAuth entirely with a PAT generated in the dashboard.

## References

- [ShipBob authentication](https://developer.shipbob.com/auth)
- [ShipBob developer overview](https://developer.shipbob.com/)
- [ShipBob quickstart](https://developer.shipbob.com/quickstart)
