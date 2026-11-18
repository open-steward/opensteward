# SkuNexus adapter

Inventory vertical adapter for [SkuNexus](https://www.skunexus.com/) — an AI-powered inventory,
order, and warehouse management platform for eCommerce merchants.

Auth: single API key sent as the `X-API-Key` request header. Supplied via `credentialFields()`.

Tenant URL: defaults to `https://app.skunexus.com/api/v1`. Override by setting
`credentials.extra.baseUrl` for multi-tenant or on-premise installations.

Webhook signing: SkuNexus does not publicly document HMAC/JWT signing — `verifyWebhook` and
`parseWebhookEvents` are not implemented.

## Supported resources
- Products (`/products`)
- Stock levels (`/inventory`)
- Locations / warehouses (`/locations`)
- Suppliers / vendors (`/vendors`)
- Purchase orders (`/purchase_orders`)
- Stock transfers (`/transfer_orders`)
- Stock adjustments (`/inventory_adjustments`)

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Bill of materials / kit components / work orders
- Cost-method internal details (FIFO / LIFO / avg)
- Customer-facing order data
