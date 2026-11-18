# Cin7 Omni adapter

Inventory surface for Cin7 Omni, the multichannel inventory and order
management platform. Distinct from the Cin7 Core (formerly DEAR Systems)
adapter, which lives in `../cin7-core`.

Auth: static API key collected via `credentialFields()` and sent as a Bearer
token (`Authorization: Bearer <apiKey>`). No browser OAuth flow.

Base URL: `https://api.cin7.com/api/v1`

Webhook: HMAC-SHA256 over the raw body, hex digest, header
`X-Cin7-Omni-Signature`.

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
