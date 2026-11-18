# EasyEcom adapter

Omnichannel inventory management for Indian e-commerce and direct-to-consumer brands.

Auth: dual-header — `x-api-key` (static key from Account Settings) + `Authorization: Bearer <jwt_token>` (90-day JWT). Both values surfaced via `credentialFields()`.

Webhook: no HMAC/JWT signing documented; webhook verification not implemented.

Docs: https://api-docs.easyecom.io/

## Supported resources
- Products (product master)
- Stock levels (inventory details per warehouse)
- Locations (warehouses)
- Suppliers (vendors)
- Purchase orders (GRNs)
- Stock transfers (inter-warehouse)
- Stock adjustments

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- Manufacturing BOM / work orders
- Cost-method internal details
- Customer-facing order data
