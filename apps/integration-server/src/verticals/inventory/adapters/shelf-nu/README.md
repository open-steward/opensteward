# Shelf.nu adapter

Open-source physical asset / equipment management platform (https://shelf.nu).

Auth: Supabase JWT sent as `Authorization: Bearer <token>`. The organisation ID
is provided alongside the token via `credentialFields()` and is sent as `?orgId=`
on every request.

Base URL: `https://app.shelf.nu`

## Supported resources
- **Products** → mapped from Shelf "assets" (`GET /api/mobile/assets`)
- **Stock levels** → synthesised from asset status (quantityOnHand always 1)
- **Locations** → (`GET /api/mobile/locations`)

## Unsupported Resources

- **Suppliers** — Shelf.nu has no supplier or vendor resource in its public REST API. The platform tracks physical asset custody and location, not procurement relationships. No supplier endpoint exists in the mobile or web API.
- **PurchaseOrders** — Shelf.nu has no purchase-order resource. Procurement workflows are handled outside Shelf; the API exposes no PO endpoint.
- **StockAdjustments** — Shelf.nu has no stock-adjustment concept. Assets are created or archived individually as discrete serialised items; there is no bulk quantity adjustment endpoint.
- **StockTransfers** — Shelf.nu has no stock-transfer resource. Moving an asset between locations is recorded as a location-change on the asset record, not as a discrete transfer document endpoint.
- **Webhooks** — Shelf.nu does not document a webhook or event-subscription endpoint with HMAC signing; `verifyWebhook` always returns `false`.

## Schema-firewall

- Asset images / file attachments
- Custom field raw values beyond metadata
- Booking / custody write operations
- Audit session data
