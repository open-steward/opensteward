# Mintsoft adapter

UK-based cloud WMS/OMS used by 3PLs and fulfilment operations.

Auth: static or 24-hour API key obtained from the Mintsoft UI or support desk.
Every request includes the key in the `ms-apikey` header.

Base URL: `https://api.mintsoft.co.uk`

Webhook: No HMAC/JWT signing documented; webhook verification not implemented.

## Supported resources
- Products (`GET /api/Product/List`, `GET /api/Product/{id}`)
- StockLevels (`GET /api/Product/Inventory/Bulk`, `GET /api/Product/StockLevels`)
- Locations / Warehouses (`GET /api/Warehouse`, one unpaged array, paged locally)
- Suppliers (`GET /api/Product/Suppliers`)
- PurchaseOrders (ASNs via `GET /api/ASN/List?IncludeASNItems=true`, `GET /api/ASN/{id}`; status is `unknown` because ASN status names are per account)
- StockTransfers (`GET /api/WarehouseTransfer/List`)

## Refused
- StockAdjustments (501): the API documents no adjustment list; `GET /api/Product/{id}/StockFlow` is per product, needs FromDate/ToDate and has no adjustment flow type
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Customer-facing order fulfillment data (use the Orders vertical)
- Internal lot/batch details beyond what StockFlow surfaces
