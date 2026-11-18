# Cheqroom adapter

Equipment/asset tracking platform. Tracks physical assets (cameras, tools, A/V gear)
through checkouts, reservations, and custody chains.

Auth: single API key via `Authorization: Bearer <apiKey>`. Generate in
Settings → Integrations → API. Keys do not expire but can be revoked.

Base URL: `https://api.cheqroom.com/api/v2_5`

Pagination: `_skip` (offset) + `_limit` query params.

## Supported resources

| OpenSteward resource | Cheqroom source |
|---|---|
| Products | `GET /items` — equipment/asset records |
| Locations | `GET /locations` — storage locations |

## Unsupported Resources

- **StockLevels** — Cheqroom is an equipment-checkout platform, not a quantity-on-hand inventory system. Individual items are tracked as discrete physical assets (each with its own `_id`), not as fungible quantities at a location. No stock-level endpoint exists in the Cheqroom API.
- **PurchaseOrders** — Cheqroom has no purchase-order resource in its public API (v2_5). Procurement is handled outside Cheqroom.
- **Suppliers** — Cheqroom has no supplier or vendor resource in its public API. Supplier information is not exposed as a first-class entity.
- **StockAdjustments** — Cheqroom has no stock-adjustment concept. Items are created/archived individually; there is no bulk quantity adjustment endpoint.
- **StockTransfers** — Cheqroom has no stock-transfer resource. Moving an item between locations is done via checkout/return flows, not a transfer record endpoint.

## Schema-firewall

- Product cover images / attachment URLs are not passed through
- Geo coordinates / address strings are kept in metadata only
- Order/checkout/reservation data is customer-facing and is not surfaced
- Kit and custody-chain internals are not surfaced
