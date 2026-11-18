# InvenTree adapter

Open-source, self-hosted inventory management system. Every deployment has its own base URL (e.g. `https://inventree.example.com`). All API paths are prefixed with `/api/`.

Auth: Static API token sent as `Authorization: Token <TOKEN>`. Users generate tokens from their instance at Profile → API Tokens. The instance URL is also required and stored in `credentials.extra.baseUrl`.

Pagination: limit/offset style (`limit` + `offset` query params); response envelope `{ count, next, previous, results[] }`.

## Refused
- Product images / 3D assets
- Supplier banking details / payment terms
- BOM / build orders / work orders
- Customer-facing sales order data
- Webhook outbound signing (InvenTree does not document a canonical HMAC scheme)
