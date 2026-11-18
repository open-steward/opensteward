# Blue Yonder (JDA) Luminate WMS adapter

Enterprise warehouse management system. Formerly JDA Software.
Auth: OAuth 2.0 client-credentials flow (tenant-scoped token endpoint).
Each customer receives a dedicated tenant subdomain at `<tenant>.blueyonder.com`.

Base URL: `https://<tenant>.blueyonder.com/wms/v1`
Token endpoint: `https://<tenant>.blueyonder.com/oauth/token`

Pagination: `page` (1-based) + `pageSize` query params.
Response envelope: `{ data: T[], pagination: { page, pageSize, totalPages, totalItems } }`.

## Supported resources

| OpenSteward resource | Blue Yonder source |
|---|---|
| StockLevels | `GET /wms/v1/inventory` — InventoryPosition records |
| PurchaseOrders | `GET /wms/v1/receipts` — inbound receipt records |

## Unsupported Resources

- **Products** — The Blue Yonder Luminate WMS public REST API does not expose an item-master endpoint. Item/SKU master data is managed in a separate ERP or merchandising system (e.g. SAP, Oracle) and synced to the WMS via file-based bulk loads; no `/items` or `/products` REST resource is available on the `wms/v1` surface.
- **Locations** — The Luminate WMS does not expose a location-master REST endpoint on its public API. Warehouse location hierarchies (aisles, zones, bins) are configured internally and not retrievable via a `/locations` GET endpoint on `wms/v1`.
- **Suppliers** — The Luminate WMS does not expose a supplier/vendor directory via its public REST API. Supplier master data lives in the connected ERP and is referenced only by ID on receipt records; no `/suppliers` endpoint exists on `wms/v1`.
- **StockAdjustments** — The Luminate WMS public REST API does not expose inventory adjustment records. Manual counts and cycle-count adjustments are performed inside the WMS UI and are not surfaced as a readable REST collection.
- **StockTransfers** — The Luminate WMS public REST API does not expose inter-location transfer records. Internal transfer movements are tracked within the WMS task engine and are not available as a `/transfers` or `/moves` collection on `wms/v1`.

## Refused

- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
