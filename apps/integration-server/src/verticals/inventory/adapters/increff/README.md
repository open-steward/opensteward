# Increff adapter

Increff Assure OMS/WMS adapter for the inventory vertical.

Increff is an enterprise supply-chain platform (OMS + WMS) for omnichannel retail. Credentials and base URL are per-tenant.

Auth: access-key + secret-key pair provisioned by Increff, sent as `access-key` / `secret-key` headers. clientCode forms the per-tenant subdomain (`https://{clientCode}.increff.com/api`).

Webhook: no HMAC/JWT signing documented in public APIs — webhook verification omitted.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
