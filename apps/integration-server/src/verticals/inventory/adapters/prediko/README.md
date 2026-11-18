# Prediko adapter

AI-powered inventory management and demand forecasting for Shopify brands.

Auth: Bearer API key sent as `Authorization: Bearer <key>`. Obtain from Settings > API Keys in the Prediko dashboard.

Base URL: `https://api.prediko.io/api/v1`

Webhooks: not implemented — no HMAC/JWT signing documented by Prediko.

## Supported resources
- Products (SKUs) — POST /skus with aggregation_level=SKU
- Stock Levels (per warehouse) — POST /skus with aggregation_level=SKU_LOCATION
- Locations (warehouses) — GET /warehouses
- Suppliers — GET /suppliers
- Purchase Orders — GET /orders, GET /orders/{id}

## Unsupported Resources

- **StockTransfers** — Prediko has no stock-transfer resource in its public API. Prediko is a demand-forecasting and replenishment tool for Shopify brands; inter-warehouse transfer orders are not modelled in the Prediko API (`/api/v1`). No endpoint exists for listing or fetching transfer records.
- **StockAdjustments** — Prediko has no stock-adjustment resource in its public API. Manual inventory count adjustments are performed inside Shopify and reflected back into Prediko via the Shopify integration; Prediko itself exposes no adjustment endpoint.

## Schema-firewall

- Bill of materials / manufacturing work orders — refused
- Product images / 3D assets / file URLs — not surfaced
- Supplier banking details / payment terms — not surfaced
- Cost-method internal details — not surfaced
- Customer-facing order data — not exposed
