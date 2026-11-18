# SphereWMS adapter

Cloud-based warehouse management system (WMS) by SphereWMS.

Auth: API key + environment name. The `key` query parameter carries the API key;
the environment name forms the tenant segment of the base URL
(`https://api.spherewms.com/v2/wms/{environment}/`).
Both values are assigned per-client by the SphereWMS support team.

Webhooks: SphereWMS does not document any HMAC/JWT webhook signing — not implemented.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kitting / work orders (schema-firewall)
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order / shipment data
