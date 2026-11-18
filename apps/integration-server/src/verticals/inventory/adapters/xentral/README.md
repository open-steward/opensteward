# Xentral adapter

Xentral is a German ERP platform for scaling e-commerce businesses.

Auth: Personal Access Token (PAT) sent as `Authorization: Bearer <token>`. Instance subdomain (`xentralId`) is required to construct the tenant base URL `https://{xentralId}.xentral.biz`.

Webhook: Not supported — Xentral's public V1 API does not document HMAC/JWT webhook signing.

## Supported resources
- Products       → `GET /api/v1/products`
- Stock levels   → `GET /api/v1/products/{id}/stocks` (per-warehouse breakdown)
- Locations      → `GET /api/v1/warehouses`
- Suppliers      → `GET /api/v1/suppliers`
- Purchase orders→ `GET /api/v1/purchaseOrders`

## Unsupported Resources

- **StockTransfers** — Xentral's public V1 REST API does not expose a stock-transfer (Umlagerung) listing endpoint. Inter-warehouse movements are managed through the ERP UI and are not accessible via a public REST endpoint.
- **StockAdjustments** — Xentral's public V1 REST API does not expose a stock-adjustment (Lagerkorrektur) listing endpoint. Inventory corrections are applied through the ERP UI; no adjustment-record API endpoint is documented.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
