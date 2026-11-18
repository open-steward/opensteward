# NetSuite inventory adapter

Inventory surface for the NetSuite ERP, over the SuiteTalk REST record API.

Auth: static API key collected via `credentialFields()` and sent as a Bearer
token (`Authorization: Bearer <apiKey>`). No browser OAuth flow.

Base URL: account-specific SuiteTalk host, shaped like
`https://<account>.suitetalk.api.netsuite.com/services/rest/record/v1`.

Webhook: HMAC-SHA256 over the raw body, hex digest, header
`X-NetSuite-Signature`.

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
