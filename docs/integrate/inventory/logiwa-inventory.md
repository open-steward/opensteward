---
vertical: inventory
platform: logiwa-inventory
title: Integrating Logiwa (Inventory)
auth_type: oauth2
partner_program: true
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Logiwa (Inventory)

Logiwa IO is a cloud WMS / order-fulfilment platform aimed at high-volume DTC and 3PL operations. The adapter wraps the Logiwa Open API and surfaces SKUs, warehouses, inventory adjustments, stock levels, and suppliers into the canonical inventory schema.

## Auth model

- **OAuth 2.0 Client Credentials grant.** The Logiwa-issued **API User** acts as `client_id`; the **API Key** acts as `client_secret`. POST these to the Logiwa token endpoint (provisioned per tenant; `https://myapi.logiwa.com/api/auth/token` for the primary cluster) to receive a bearer token used on every request.
- Tokens are short-lived; the adapter refreshes ahead of expiry.
- All API calls are authenticated via `Authorization: Bearer <token>`.

## Prerequisites

1. A Logiwa IO contract that includes API access — **API access must be added to your sales contract**; it is not enabled by default.
2. Request an API User from Logiwa Customer Support; they provision the API User + API Key and assign a rate-limit tier (Standard = 60 RPM, Enterprise = 530 RPM).
3. Tenant API host (`myapi.logiwa.com` or a region-specific host) is provided by Logiwa during onboarding.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **Logiwa**.
2. Fill **Configure**:
   - `clientId` — your Logiwa API User.
   - `clientSecret` — your Logiwa API Key.
   - `apiHost` — tenant API host (e.g. `https://myapi.logiwa.com`).
3. Enable the adapter.

## Required scopes

Logiwa does not expose OAuth scopes — the API User's permissions are configured server-side in Logiwa. Ask the Logiwa team to scope the API User to the inventory + warehouse modules only.

## Webhooks

Logiwa supports **webhooks** for inventory and order events; subscriptions are configured in the Logiwa admin UI. Webhook deliveries are not HMAC-signed by default — instead Logiwa uses a per-subscription bearer token: it sends `Authorization: Bearer <secret>` on each call. The adapter compares this against the secret you configure.

Subscribe to inventory-adjustment, stock-receive, and SKU-update events for the canonical surface.

## Quirks worth knowing

- **Partner-gated access.** No self-serve credentials; Customer Support provisions API users.
- **Rate-tier matters.** 1 RPS on Standard is restrictive — the adapter serialises writes per tenant.
- **Bearer-on-webhooks, not HMAC.** Configure a strong shared secret per subscription; rotate it through Logiwa support if it leaks.
- **Swagger is the source of truth.** Logiwa's OpenAPI spec is published at `https://myapi.logiwa.com/swagger/index.html`; the marketing site lags behind it.

## References

- [Logiwa Open API article](https://logiwa.my.site.com/logiwahelp/s/article/Logiwa-Open-API)
- [Logiwa Swagger UI](https://myapi.logiwa.com/swagger/index.html)
- [Logiwa Webhooks vs APIs](https://www.logiwa.com/blog/logiwa-webhooks)
