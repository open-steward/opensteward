# KORONA POS adapter

KORONA.cloud (by COMBASE) is a cloud-based POS and inventory management platform.

Auth: HTTP Basic (username + password), plus a KORONA account UUID. Credentials are
Base64-encoded and sent in the `Authorization` header. `credentialFields()` collects
`username`, `password`, and `accountId`.

API: REST v3 — `https://www.koronacloud.com/web/api/v3/accounts/{accountId}/...`

Pagination: `page` + `size` query params; response envelope `{ results[], pagesTotal, currentPage, resultsTotal }`.

Webhooks: no documented HMAC/JWT webhook signing; webhook support is omitted.

## Resource mapping

| OpenSteward resource | KORONA endpoint |
|---|---|
| products | `GET /products` |
| stock levels | `GET /products/{id}/stocks` |
| locations | `GET /organizationalUnits` |
| suppliers | `GET /suppliers` |
| purchase orders | `GET /stockReceipts` (supplier-sourced) |
| stock transfers | `GET /stockReceipts` (with sourceOrganizationalUnit) |
| stock adjustments | `GET /inventoryLists` (status=BOOKED) |

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
