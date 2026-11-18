# Qoblex adapter

Cloud inventory management for e-commerce and multi-warehouse operations.
API base: `https://api.qoblex.com` (v1).

Auth: single API key sent as `qoblex-x-api-key` header. Configured via `credentialFields()`.

Pagination: 0-based `page` param, max 50 entries per page. Rate limit: 10 req / 60 s.

Webhooks: not documented in Qoblex public API — `verifyWebhook` / `parseWebhookEvents` not implemented.

## Supported resources
- Products (flattened from product + variants)
- Stock levels (via variant location entries)
- Locations (`/v1/account/locations`)
- Suppliers (`/v1/suppliers`)
- Purchase orders (`/v1/purchase_orders`)
- Stock adjustments (`/v1/adjustments`)

## Not supported
- Stock transfers (Qoblex v1 has create-only POST, no list/get)
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / manufacturing orders
- Cost-method internal details
- Customer-facing sales order data
