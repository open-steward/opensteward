# ERPAG adapter

Cloud-based MRP/ERP (erpag.com).

Auth: API key + API secret, sent as `Authorization: Basic base64(apiKey:apiSecret)`.
Both fields surfaced via `credentialFields()`.

Rate limit: 2 requests/second.

ERPAG's list endpoints return arrays of string IDs only; the adapter fetches
individual records by ID and slices client-side for pagination.

Webhooks: not documented by ERPAG — no webhook support implemented.

## Supported resources
- Products (`/items` + `/item`)
- Stock levels (embedded in each item's `inventory` array)
- Suppliers (`/suppliers` + `/supplier`)
- Purchase orders (`/purchaseorders` + `/purchaseorder`)

## Unsupported Resources

- **Locations** — ERPAG does not expose a warehouse/location list endpoint in its public REST API. Warehouse names appear only as string identifiers embedded in item inventory entries; there is no `/warehouses` or `/locations` resource to enumerate.
- **StockTransfers** — ERPAG has no stock-transfer document resource in its public API. Inter-warehouse movements are managed through the ERP UI and are not accessible via a REST endpoint.
- **StockAdjustments** — ERPAG has no stock-adjustment document resource in its public API. Inventory count corrections are applied through the ERP UI; no adjustment-record endpoint is documented.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order data
