# Listing Mirror adapter

Multi-channel e-commerce listing and inventory sync platform.

Auth: HTTP Basic — `Authorization: Basic base64("username:api_token")`. Credentials from Integrations > API in the Listing Mirror account. Connect Link surfaces both fields via `credentialFields()`.

API docs: https://api.listingmirror.com/api/v3/guide/

## Supported resources
- **products** — parent listings with nested variations (each variation flattened to a child Product)
- **stock-levels** — account-wide inventory per SKU (`/v3/inventory/`)

## Unsupported Resources

- **Locations** — Listing Mirror v3 has no per-warehouse or per-location inventory breakdown. All inventory is tracked account-wide per SKU via `/v3/inventory/`. No location-management endpoint exists in the documented API.
- **Suppliers** — Listing Mirror v3 exposes no supplier or vendor resource. Supplier relationships are not available as a first-class entity in the v3 REST API.
- **PurchaseOrders** — Listing Mirror v3 provides no purchase-order endpoint. Procurement workflows are not part of the documented v3 API surface.
- **StockTransfers** — Listing Mirror v3 has no stock-transfer resource. Moving inventory between locations is not modelled by the v3 API.
- **StockAdjustments** — Listing Mirror v3 has no stock-adjustment endpoint. Inventory quantity changes are written directly to the quantity field; there is no adjustment log or audit-trail resource in v3.
- **Webhooks** — Listing Mirror v3 provides no documented HMAC or JWT webhook signing mechanism; webhook parsing is omitted.

## Refused
- Product images / asset URLs
- Supplier banking details / payment terms
- Customer order data
- Channel-specific pricing (returns base price only)
