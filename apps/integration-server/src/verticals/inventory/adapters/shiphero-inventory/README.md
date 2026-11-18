# ShipHero inventory adapter

Warehouse-management inventory surface (`public-api.shiphero.com/graphql`).

Auth: static API key, entered via `credentialFields()` and sent as a `Bearer` token. OAuth is not supported (`getAuthUrl` throws).

Webhook: HMAC-SHA256 over body, header `X-Shiphero-Signature` (hex).

Resources: products, stock levels (list-only — no single-record fetch), locations, suppliers, purchase orders, stock transfers, stock adjustments.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
