# MarketMan adapter

Restaurant-focused inventory management platform (marketman.com).

Auth: APIKey + APIPassword pair → POST /buyers/auth/GetToken → `AUTH_TOKEN` header.
The session token is short-lived; `refreshCredentials()` re-acquires it automatically
using the stored `apiKey`/`apiPassword` in `credentials.extra`.

Docs: https://api-doc.marketman.com/

## Supported resources

| Resource         | Source endpoint                          | Response key      |
|-----------------|------------------------------------------|-------------------|
| Products         | POST /buyers/inventory/GetInventoryItems | Items             |
| StockLevels      | POST /buyers/inventory/GetInventoryCounts| InventoryCounts   |
| Locations        | Derived from item StorageIDs/StorageNames| (no dedicated endpoint) |
| Suppliers        | POST /buyers/items/GetVendors            | Vendors           |
| PurchaseOrders   | POST /buyers/orders/GetOrdersBySentDate  | Orders            |
| StockTransfers   | POST /buyers/inventory/GetTransfers      | Transfers         |
| StockAdjustments | POST /buyers/inventory/GetInventoryCounts| InventoryCounts   |

Time-scoped endpoints default to a 90-day lookback window.

Webhooks: not implemented — no signature spec published by MarketMan.

## Refused
- Product images / media assets
- Supplier banking details / payment terms
- Customer-facing POS / sales order data
- Menu recipes / prep items (food-service specific; not modelled by the inventory schema)
