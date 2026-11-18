# MRPeasy adapter

Cloud MRP/ERP for small manufacturers. Base URL: `https://api.mrpeasy.com/rest/v1`.

Auth: HTTP Basic (apiKey:apiSecret), base64-encoded. Both fields surfaced via `credentialFields()`.

Pagination: `Range: items=<offset>-<end>` request header.

Webhook: No HMAC/JWT signing documented in MRPeasy v1. Webhooks send status-change notifications to a URL with optional HTTP Basic Auth — no verifiable signature header. `webhook.ts` not included.

## Supported resources
- Products (`/items`, `/items/{id}`)
- Stock Levels (`/stock/inventory`, `/stock/inventory/{article_id}`)
- Suppliers/Vendors (`/vendors`, `/vendors/{id}`)
- Purchase Orders (`/purchase-orders`, `/purchase-orders/{id}`)

## Not supported by MRPeasy v1 API
- Locations/Warehouses (sites are embedded as `site_id` on items; no list endpoint)
- Stock Transfers (no dedicated endpoint in v1)
- Stock Adjustments (no dedicated endpoint in v1)

## Refused (schema-firewall)
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / work orders / manufacturing orders
- Cost-method internal details
- Customer-facing order data
