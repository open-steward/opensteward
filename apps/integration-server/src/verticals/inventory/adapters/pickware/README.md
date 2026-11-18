# Pickware adapter

Shopware ERP powered by Pickware — warehouse management plugin for Shopware 5.

Auth: HTTP Basic Authentication — `base64(username:api_key)`. The shop URL is customer-supplied (their own Shopware 5 instance). Connect Link surfaces all three fields via `credentialFields()`.

Base URL: customer-supplied Shopware 5 instance URL (e.g. `https://myshop.example.com/api`).

## Supported resources

| OpenSteward resource | Pickware / Shopware 5 source |
|---|---|
| Products | `GET /api/articles` — Shopware 5 article records |
| Locations | `GET /api/warehouses` — Pickware warehouse records |
| StockLevels | `GET /api/binLocations/{id}` — per-bin article-stock mappings |

## Unsupported Resources

- **Suppliers** — The Pickware REST API does not expose a vendor/supplier resource. Shopware 5's `supplierId` field on articles references the internal manufacturer record, not a purchasable supplier entity with contact or lead-time fields. No `/api/suppliers` endpoint exists in Pickware or Shopware 5.
- **PurchaseOrders** — Pickware does not expose a purchase-order resource through its REST API. Procurement/replenishment workflows are managed inside the Pickware UI only and are not accessible via API.
- **StockAdjustments** — Pickware does not provide a REST endpoint for stock-adjustment history or stock-take records. The only stock data exposed is the current bin-location quantity via `GET /api/binLocations/{id}`.
- **StockTransfers** — Pickware does not expose a stock-transfer resource via its REST API. Inter-warehouse movements are managed inside the Pickware plugin UI and are not accessible programmatically.

## Schema-firewall

- Product images / 3D assets / file URLs are not passed through
- Supplier banking details / payment terms are not surfaced (use accounting vertical for AP)
- BOM / kit components / work orders are not exposed
- Cost-method internal details are not exposed
- Customer-facing order data is not exposed
