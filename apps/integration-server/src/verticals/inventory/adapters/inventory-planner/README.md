# Inventory Planner adapter

Demand-forecasting and replenishment tool by Sage. Sits above an e-commerce platform
(Shopify, WooCommerce, etc.) and provides purchase-order management and stock analytics.

Base URL: `https://app.inventory-planner.com`

Auth: API key + Account ID pair, both sent as plain HTTP headers:
  `Authorization: <api_key>` and `Account: <account_id>`
Keys are generated in Account → Settings → API.

## Supported resources

| Resource | Endpoint |
|---|---|
| Products (variants) | `GET /api/v1/variants` |
| Stock Levels | Derived from `variant.warehouses` map |
| Suppliers (vendors) | `GET /api/v1/vendors` |
| Purchase Orders | `GET /api/v1/purchase-orders` |

## Unsupported Resources

- **Locations** — Inventory Planner has no warehouse/location endpoint. Warehouse names surface only as keys inside variant.warehouses map data; there is no `GET /api/v1/warehouses` (or equivalent) in the documented public REST API. `listLocations` / `getLocation` are not implemented.
- **StockAdjustments** — Inventory Planner is a demand-forecasting and replenishment planning layer that sits above the source-of-record e-commerce platform (Shopify, WooCommerce, etc.). Inventory adjustments (cycle counts, write-offs, corrections) are executed and tracked in the connected platform. The Inventory Planner public REST API has no stock-adjustment endpoint. `listStockAdjustments` / `getStockAdjustment` are not implemented.
- **StockTransfers** — For the same reason, inter-warehouse transfers are executed in the connected e-commerce/ERP platform. Inventory Planner's public REST API does not expose a stock-transfer endpoint. `listStockTransfers` / `getStockTransfer` are not implemented.
- **Webhooks** — Inventory Planner does not publish a documented public webhook delivery or signature-verification API. `parseWebhookEvents` is not implemented.

## Schema-firewall

- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Customer-facing order data
- Forecasting internals / demand-model parameters
