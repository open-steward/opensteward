# StoreFeeder adapter

Multi-channel ecommerce management with inventory and purchasing.

Auth: HTTP Basic — `base64(username:apiKey)` in `Authorization: Basic` header.
API key obtained from Settings > Company > Users > User Permissions > View / Edit Permissions.

Docs: https://rest.storefeeder.com/Help

## Supported resources
- `products` — GET /products, GET /products/{id}
- `stock-levels` — derived from GET /products?IncludeStockLocations=true (per-location)
- `locations` — GET /warehouses, GET /warehouses/{id}
- `suppliers` — GET /suppliers
- `purchase-orders` — GET /purchase-orders
- `stock-adjustments` — GET /products/{id}/productinventorylogs (per-product; requires filter.productId)

## Not supported
- `stock-transfers` — StoreFeeder only has a write endpoint (POST /stocklocations/create-transfers); no read endpoint documented
- `webhooks` — no outbound webhook capability documented in the public API

## Refused (schema-firewall)
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components
- Cost-method internal details
- Customer-facing order data
