# Sellbrite adapter

Multi-channel inventory management platform.

Auth: HTTP Basic — `account_token:secret_key` encoded as Base64. Connect Link surfaces both fields via `credentialFields()`. Credentials do not expire.

Base URL: `https://api.sellbrite.com/v1`

Pagination: `GET /products` and `GET /inventory` take `limit` + `page` (1-indexed) query parameters. Their docs state no maximum page size, so the adapter declares no `maxPageSize` (the 100-record cap Sellbrite documents is for `GET /orders`, which this adapter does not call). `GET /warehouses` documents no query parameters and returns every warehouse, so `listLocations` pages that list locally.

## Supported resources

| OpenSteward resource | Sellbrite source |
|---|---|
| Products | `GET /products`, `GET /products/:sku` |
| StockLevels | `GET /inventory` — on-hand, available, reserved quantities per warehouse |
| Locations | `GET /warehouses` — warehouse records |

## Unsupported Resources

- **PurchaseOrders** — Sellbrite has no purchase-order resource in its public REST API (`https://api.sellbrite.com/v1`). Sellbrite is a multi-channel listing and order-routing platform; procurement/receiving workflows are not exposed via the API.
- **Suppliers** — Sellbrite has no supplier or vendor resource in its public API. Vendor/supplier management is not part of the Sellbrite feature set exposed via REST.
- **StockAdjustments** — Sellbrite has no stock-adjustment endpoint. Inventory quantities are updated indirectly through order fulfillment and manual warehouse edits in the UI; no adjustment-record API exists.
- **StockTransfers** — Sellbrite has no stock-transfer resource. Moving inventory between warehouses is done through the Sellbrite UI; no transfer-record API endpoint is available.

## Schema-firewall

- Webhook signature verification is not available (Sellbrite does not provide a signed-webhook scheme)
- Single stock-level fetch is not available (bulk-only endpoint; call `listStockLevels` instead)
- Product images / attachment URLs are not passed through
- Customer-facing order data is not exposed
