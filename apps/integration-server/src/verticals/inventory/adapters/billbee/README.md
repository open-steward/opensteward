# Billbee adapter

Multi-channel e-commerce management platform (Germany).

Auth: `X-Billbee-Api-Key` header + HTTP Basic Auth (username + API password). Both surfaced via `credentialFields()`.

Base URL: `https://app.billbee.io/api/v1`

Rate limit: 2 requests/second per API key + user combination; 429 respected with Retry-After.

## Supported resources
- **products** — `GET /products`, `GET /products/{id}`
- **stock-levels** — derived from product `Stocks[]` per-warehouse entries
- **locations** — `GET /products/stocks` (warehouse definitions)

## Unsupported Resources

- **Suppliers** — Billbee has no supplier or vendor resource in its public REST API. Vendor/contact management is not exposed as a first-class entity; the API is focused on multi-channel order management and does not include a procurement supplier catalogue.
- **PurchaseOrders** — Billbee has no purchase-order resource in its public REST API (v1). Procurement and replenishment workflows are handled entirely outside Billbee; the API exposes no endpoint for creating, listing, or updating purchase orders.
- **StockTransfers** — Billbee has no stock-transfer resource in its public REST API. Moving stock between warehouses is performed via internal Billbee UI workflows; no transfer-record endpoint is available through the API.
- **StockAdjustments** — Billbee exposes a write-only stock-update endpoint (`POST /products/{id}/updatestock`) that sets an absolute quantity; it does not expose a queryable adjustment-log resource. There is no endpoint to list or retrieve historical stock adjustment records.

## Refused
- Product images / file URLs
- BOM / kit components
- Customer-facing order data
- Supplier banking / payment terms
