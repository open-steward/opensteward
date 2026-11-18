# Zoho Inventory adapter

Inventory surface for Zoho Inventory, the cloud inventory and order
management application.

Auth: static API key collected via `credentialFields()` and sent as a Bearer
token (`Authorization: Bearer <apiKey>`). No browser OAuth flow.

Base URL: `https://www.zohoapis.com/inventory/v1`

Webhook: HMAC-SHA256 over the raw body, hex digest, header `X-Zoho-Signature`.

## Resources
- Products
- Stock levels — bulk list only; single stock-level fetch is not available
  (call `listStockLevels`)
- Locations
- Suppliers
- Purchase orders
- Stock transfers
- Stock adjustments

## Refused (schema-firewall)
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order data
