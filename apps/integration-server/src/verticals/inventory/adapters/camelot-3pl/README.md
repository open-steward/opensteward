# Camelot 3PL Software (Excalibur WMS) adapter

WMS for third-party logistics warehouses. Each customer instance is self-hosted
at a distinct URL supplied by the Camelot implementation team.

Auth: Bearer API key (`Authorization: Bearer <apiKey>` header). Three credential
fields are required: `baseUrl` (tenant webservice URL), `apiKey`, and
`clientCode` (warehouse customer code).

Webhook: No documented HMAC/JWT webhook signing. Webhooks not supported.

## Supported resources
- Products (`/items`)
- Stock levels (`/inventoryout`)
- Locations / warehouses (`/warehouses`)
- Suppliers / vendors (`/vendors`)
- Purchase orders / inbound orders (`/orderin`)
- Stock transfers (`/transfers` — requires custom export profile)
- Stock adjustments (`/adjustments` — requires custom export profile)

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- Manufacturing BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing outbound order financials
