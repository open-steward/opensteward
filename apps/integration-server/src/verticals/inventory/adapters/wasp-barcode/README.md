# Wasp Barcode Technologies — InventoryCloud adapter

Cloud-based inventory management for SMBs. Barcode scanning, location tracking, stock control.

Auth: API key (Bearer token) + tenant subdomain. Both collected via `credentialFields()`.
Base URL: `https://{tenant}.waspinventorycloud.com/public-api`
All endpoints are POST with JSON body.

Webhooks: Not supported — InventoryCloud does not publish outbound webhook events. This is a polling-only integration.

Rate limit: 200 requests/minute. 429 responses trigger exponential backoff.

## Supported resources
- Products (items via ic/item/advancedinfosearch)
- StockLevels (ic/item/advancedinventorysearch)
- Locations (sites + sub-locations combined)
- Suppliers (vendors)
- PurchaseOrders (ic/purchaseorder)
- StockAdjustments (transaction-history-v2, TransactionType=Adjust)
- StockTransfers (transaction-history-v2, TransactionType=Move)

## Refused
- Product images / file attachments
- Supplier banking details / payment terms
- BOM / kit components / assembly work orders
- Customer-facing order data (pick/pack/ship orders)
- Cost-method internal details
