# SAP S/4HANA Cloud — Inventory Management adapter

Adapter for the SAP S/4HANA Cloud inventory vertical. Covers material/product
master, stock levels by plant+storage location, supplier master, purchase orders,
stock transport orders (transfers), and material document adjustments.

Auth: OAuth 2.0 client-credentials grant.
Token URL: `https://<tenant>-api.s4hana.ondemand.com/sap/bc/sec/oauth2/token`

Webhook: Not supported. SAP delivers events via SAP Event Mesh (BTP AMQP/CloudEvents),
not via direct HMAC-signed HTTP callbacks.

## APIs used

| Resource | SAP Service | Entity set |
|---|---|---|
| Products | API_PRODUCT_SRV | A_Product |
| Stock Levels | API_MATERIAL_STOCK_SRV | A_MatlStkInAcctMod |
| Locations | API_MATERIAL_STOCK_SRV (distinct Plant and Plant+StorageLocation of the stock) | A_MatlStkInAcctMod |
| Suppliers | API_BUSINESS_PARTNER | A_Supplier |
| Purchase Orders | API_PURCHASEORDER_PROCESS_SRV | A_PurchaseOrder (type ≠ UB) |
| Stock Transfers | API_PURCHASEORDER_PROCESS_SRV | A_PurchaseOrder (type = UB) |
| Stock Adjustments | API_MATERIAL_DOCUMENT_SRV | A_MaterialDocumentHeader |

Locations are read from the stock table in Plant, StorageLocation order
(`$orderby`), each page starting where the last one ended by `$filter`, so a
page of N locations, read in order, costs at most 2N + 1 requests however much
stock they hold. A service that does not apply `$orderby` or `$filter` makes the list
throw rather than repeat locations. A storage location that holds no stock is
not listed.

## Refused

- Product images / 3D assets / file URLs
- Supplier banking details / IBAN / payment terms
- BOM / kit components / work orders / production orders
- Cost-method internals (FIFO / LIFO / moving-average)
- Customer-facing order or sales data
