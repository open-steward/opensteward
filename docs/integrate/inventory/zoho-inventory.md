---
vertical: inventory
platform: zoho-inventory
title: Integrating Zoho Inventory
auth_type: oauth2
partner_program: false
estimated_time: 25min
last_verified: 2026-05-23
written_by: claude
---

# Zoho Inventory

Zoho Inventory is the inventory + order-management product in the Zoho One suite, tightly integrated with Zoho Books, Zoho CRM, and the Zoho Commerce stack. The adapter wraps the Zoho Inventory REST API v1 and surfaces items, item groups, warehouses, stock adjustments, vendors, and purchase orders into the canonical inventory schema.

## Auth model

- **OAuth 2.0 Authorization Code grant** via the Zoho Accounts service. Authorize at `https://accounts.zoho.{region}/oauth/v2/auth`. Exchange via POST to `https://accounts.zoho.{region}/oauth/v2/token`.
- Access tokens expire after `3600` seconds. Refresh tokens are long-lived (unlimited until revoked); the adapter handles refresh transparently.
- `{region}` is the user's data center TLD: `com` (US), `eu`, `in`, `com.au`, `jp`, `com.cn`, `ca`, `sa`. The token response includes `location` / `accounts-server`; the matching API host is `https://www.zohoapis.{region}/inventory/v1`.

## Prerequisites

1. A Zoho Inventory account at [inventory.zoho.com](https://inventory.zoho.com) (or your regional URL).
2. A registered client in the **Zoho API Console** ([api-console.zoho.com](https://api-console.zoho.com)) of type **Server-based Application**. Note the **Client ID**, **Client Secret**, and registered redirect URI.
3. The `organization_id` of the Zoho Inventory org you intend to access — passed as a query parameter on every API call.

## Configure in admin

1. Open `/platforms` in the admin UI, filter to **Inventory**, click **Zoho Inventory**.
2. Fill **Configure**:
   - `clientId` — from the Zoho API Console.
   - `clientSecret` — from the Zoho API Console.
   - `redirectUri` — `${PUBLIC_BASE_URL}/auth/inventory/zoho-inventory/callback`.
   - `organizationId` — surfaced on first authorization; the adapter caches it per credential.
3. Enable the adapter.

## Required scopes

Zoho Inventory scopes follow `ZohoInventory.<module>.<operation>`. Request at minimum:

- `ZohoInventory.items.ALL` — items + item groups.
- `ZohoInventory.contacts.ALL` — vendors (and customers, used as inbound order references).
- `ZohoInventory.purchaseorders.ALL` — purchase orders.
- `ZohoInventory.warehouses.READ` — warehouse master list.
- `ZohoInventory.settings.READ` — taxes, units, currencies.
- `ZohoInventory.stockadjustments.ALL` — manual stock adjustments.

Operations are one of `READ`, `CREATE`, `UPDATE`, `DELETE`, `ALL`.

## Webhooks

Zoho Inventory does not expose a fully documented public webhook API; the canonical near-real-time mechanism is **Zoho Inventory Custom Functions** triggered from automation workflows that POST to an external URL. The adapter accepts these payloads with optional HMAC-SHA256 verification on the `X-Zoho-Signature` header (hex) when a shared secret is configured.

For pure pull integrations, use `last_modified_time` filters on items + stock-adjustments for delta sync.

## Quirks worth knowing

- **Region is sticky and required.** Each DC has its own accounts host **and** its own API host (`zohoapis.eu`, `zohoapis.in`, ...). Mixing hosts results in `INVALID_OAUTH_TOKEN`.
- **`organization_id` is required on every call.** Cache it per credential the first time you authenticate.
- **Refresh-token rate limits.** 5 refreshes/minute, 20 active per user — cache aggressively.
- **Inventory and Books share many concepts.** Items overlap between products; if the tenant uses both, prefer Zoho Inventory as the source of truth for stock and Zoho Books for accounting fields.

## References

- [Zoho Inventory OAuth overview](https://www.zoho.com/inventory/api/v1/oauth/)
- [Zoho OAuth introduction](https://www.zoho.com/accounts/protocol/oauth.html)
- [Multi-DC support](https://www.zoho.com/accounts/protocol/oauth/multi-dc.html)
