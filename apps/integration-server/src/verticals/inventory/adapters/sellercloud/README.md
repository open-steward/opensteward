# Descartes Sellercloud adapter

Omnichannel e-commerce operations platform with warehouse, catalog, vendor, and purchase-order management.

Auth: username + password exchanged for a JWT Bearer token via `POST {baseUrl}/api/token`. The client transparently re-authenticates when the token nears expiry (55-min window before the 60-min TTL). Base URL is team-specific: `https://{teamSubdomain}.api.sellercloud.com/rest`.

Webhook: none — Sellercloud does not document HMAC or JWT webhook event signing.

## Supported resources
- Products (`/api/catalog`)
- Stock levels per warehouse (`/api/Inventory/Warehouses`)
- Locations / warehouses (`/api/Warehouses`)
- Suppliers / vendors (`/api/Vendors`)
- Purchase orders (`/api/purchaseorders`, `/api/PurchaseOrders/{id}/Items`)
- Stock transfers / WITR (`/api/WarehouseInventoryTransfers`)

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
- Stock adjustments (write-only endpoint, no historical list)
