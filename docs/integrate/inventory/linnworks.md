---
vertical: inventory
platform: linnworks
title: Integrating Linnworks
auth_type: oauth2
partner_program: true
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Linnworks

Linnworks is a UK-based multichannel order + inventory management platform. The adapter wraps the Linnworks.net API and surfaces stock items, locations, stock levels, suppliers, and stock movements into the canonical inventory schema.

## Auth model

- **OAuth 2.0 Client Credentials grant** for channel integrations: POST to `https://api.linnworks.net/api/Auth/AuthorizeByApplication` with `applicationId`, `applicationSecret`, and a per-install `token`.
- **Application install flow** (Linnworks' equivalent of "user authorization"): the merchant clicks an install link in the Linnworks app store, which produces a static `token` that the integration then exchanges via `AuthorizeByApplication` for an `Authorization` token.
- The returned `Token` is the bearer used in the `Authorization` header for every API call; the response also includes `Server` (the per-install API host such as `https://eu-ext.linnworks.net`).

## Prerequisites

1. A Linnworks account at [linnworks.com](https://www.linnworks.com).
2. A registered **System Integration** application in the Linnworks Developer Portal ([developer.linnworks.com](https://developer.linnworks.com)). Note the **Application ID**, **Application Secret**, and configure the install URL + scope manifest.
3. To publish on the Linnworks App Store you must enrol in the Linnworks partner programme and pass app review.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **Linnworks**.
2. Fill **Configure**:
   - `clientId` — your Linnworks Application ID.
   - `clientSecret` — your Linnworks Application Secret.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/inventory/linnworks/callback` (used as the install completion URL).
3. Enable the adapter. On each install the adapter calls `AuthorizeByApplication` with the install `token` and stores the returned `Token` + `Server`.

## Required scopes

Scopes are declared in the application manifest at registration time and granted during install — Linnworks issues a space-delimited list back at auth time. Request scopes covering Inventory (`Inventory.View`, `Inventory.Edit`), Stock (`Stock.View`, `Stock.Edit`), Locations, and Suppliers.

## Webhooks

Linnworks does not provide HMAC-signed webhooks at the API level. Real-time data is delivered via the **Channel Integration** push endpoints you implement on your side (Linnworks calls you when an order or inventory change occurs and authenticates by sending the OAuth bearer token issued at install time). The adapter exposes endpoints to receive these pushes and validates the inbound token against the stored install record.

For inventory-only sync, the adapter falls back to polling `Stock/GetStockItemsFull` and `Stock/GetItemChangesHistory` on a configurable cadence.

## Quirks worth knowing

- **Per-install API host.** The `Server` returned at install time is sticky for the lifetime of that install — always use it instead of `api.linnworks.net` for data calls.
- **Token rotation.** Tokens are long-lived but can be revoked from the merchant's app management UI; on a 401 re-run `AuthorizeByApplication` with the original install token.
- **Channel push, not webhooks.** Real-time delivery is push from Linnworks to your channel endpoints; subscribe carefully.
- **EU vs US tenancy.** Linnworks runs separate clusters; the `Server` value tells you which one.

## References

- [Linnworks OAuth Authorization endpoint](https://apidocs.linnworks.net/docs/channel-integration-endpoint-oauthauthorization)
- [Linnworks API auth overview](https://help.linnworks.com/support/solutions/articles/7000043829-authorization-api-token)
- [Linnworks developer portal](https://developer.linnworks.com/)
