# Fulfil.io adapter

Inventory surface for Fulfil.io, the Tryton-based cloud ERP for ecommerce
brands.

Auth: static API key plus tenant subdomain collected via `credentialFields()`;
the key is sent as the `x-api-key` header on every request. No browser OAuth
flow.

Base URL: tenant-specific, `https://<subdomain>.fulfil.io/api/v2`. Reads go
through the generic model endpoints (`GET /model/<model>` with `fields[]`
params, `PUT /model/<model>/search_read` with Tryton domain filters);
pagination is `page` + `per_page`.

Webhook: HMAC-SHA256 over the raw body, Base64 digest, header
`X-Fulfil-Hmac-SHA256`. Payload topics (e.g. `product.product/write`) map to
resource events.

## Resources (Tryton model in parentheses)
- Products (`product.product`)
- Stock levels — bulk list only; single stock-level fetch is not available
  (call `listStockLevels`)
- Locations (`stock.location`)
- Suppliers (`party.party`)
- Purchase orders (`purchase.purchase`)
- Stock transfers (`stock.shipment.internal`)
- Stock adjustments (`stock.inventory`)

## Refused (schema-firewall)
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order data
