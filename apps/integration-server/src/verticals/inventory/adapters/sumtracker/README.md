# Sumtracker adapter

Multi-channel inventory management for ecommerce brands (Shopify, Amazon, eBay, Etsy, Walmart, etc.).

Auth: single API key sent as `Authorization: Bearer <key>` header. Connect Link surfaces this via `credentialFields()`.

Webhook: No public HMAC/JWT signing documentation from Sumtracker; webhook verification is not implemented.

## Supported resources
- Products
- Inventory / stock levels (per warehouse)
- Warehouses (locations)
- Suppliers
- Purchase orders
- Stock adjustments

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / bundles (schema-firewall)
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
- Stock transfers (no public API evidence)
