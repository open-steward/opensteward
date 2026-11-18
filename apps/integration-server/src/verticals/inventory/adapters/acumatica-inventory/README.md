# Acumatica inventory adapter

Inventory surface for Acumatica, the cloud ERP, over its contract-based REST
entity API.

Auth: static API key collected via `credentialFields()` and sent as a Bearer
token (`Authorization: Bearer <apiKey>`). No browser OAuth flow.

Base URL: instance-specific entity endpoint, shaped like
`https://<instance>.acumatica.com/entity/Default/22.200.001`.

Webhook: HMAC-SHA256 over the raw body, hex digest, header
`X-Acumatica-Signature`.

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
