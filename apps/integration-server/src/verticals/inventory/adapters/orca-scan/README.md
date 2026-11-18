# Orca Scan adapter

Barcode scanning inventory platform. Organises data as "sheets" (scan areas / locations) containing "rows" (scanned items / products with quantity).

Auth: API key sent as `Authorization: Bearer <key>` header. Business plan required.

Base URL: `https://api.orcascan.com/v1`

Rate limit: 15 requests/second; responds with 429 + `Retry-After`.

## Supported resources
- **Locations** — each Orca Scan sheet maps to a Location
- **Products** — each row maps to a Product (barcode → SKU/UPC)
- **StockLevels** — row `quantity` field maps to on-hand quantity per sheet

## Paging
Nothing in the API pages: in the [OpenAPI spec](https://api.orcascan.com/v1/openapi.json), `GET /sheets` takes no parameters and `GET /sheets/{sheetId}/rows` takes only `barcode` and `withTitles`. Each returns the whole collection. The adapter serves the caller's pages itself, in `_id` order, and declares no `maxPageSize`:
- Locations: every call reads `GET /sheets` and slices it (`pageLocally`).
- Products and stock levels: each sheet's rows are one upstream page of `pageByRows`. The next caller page continues from the sheet the last one ended in.

`getLocation` finds the sheet in `GET /sheets`. The spec has no `GET /sheets/{sheetId}`, and the settings endpoint returns neither the sheet's id nor its name. It does return the webhook secret and PINs.

## Unsupported Resources

- **PurchaseOrders** — Orca Scan has no purchase-order concept in its public API. The platform is a barcode-scanning inventory tracker; procurement workflows are managed outside of it. No PO endpoint exists.
- **Suppliers** — Orca Scan has no supplier or vendor resource in its public API. Supplier information is not a first-class entity within the platform.
- **StockTransfers** — Orca Scan has no stock-transfer resource. Moving items between sheets (locations) is done by re-scanning under a different sheet, not via a transfer record endpoint.
- **StockAdjustments** — Orca Scan has no stock-adjustment entity. Quantity changes are recorded by editing row values directly; there is no adjustment-journal or delta-record endpoint.

## Refused
- Product images / photo fields
- Attachment file content
- Customer-facing order data
