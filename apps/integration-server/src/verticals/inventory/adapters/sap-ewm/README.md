# SAP Extended Warehouse Management (SAP EWM) adapter

Adapter for SAP EWM embedded in SAP S/4HANA (on-premise and private cloud).
Covers product master, available warehouse stock, storage-bin locations, supplier
master, inbound deliveries (treated as purchase orders), warehouse tasks (stock
transfers), and physical inventory items (stock adjustments).

Auth: OAuth 2.0 client-credentials grant.
Token URL: `https://<tenant>/sap/bc/sec/oauth2/token`

Webhook: Not directly supported. SAP EWM delivers events via SAP Event Mesh
(BTP CloudEvents over AMQP/HTTP), not via HMAC-signed HTTP callbacks.
`verifyWebhook` always returns `false`; event parsing uses the CloudEvents 1.0
envelope emitted by SAP Event Mesh.

## APIs used

| Resource | SAP OData v2 Service | Entity set |
|---|---|---|
| Products | API_PRODUCT_SRV | A_Product |
| Stock Levels | WAREHOUSEAVAILABLESTOCK_0001 | WarehouseAvailableStock |
| Locations | Derived from WarehouseAvailableStock (EWMWarehouse / EWMStorageType / EWMStorageBin) | — |
| Suppliers | API_BUSINESS_PARTNER | A_Supplier + $expand=to_BusinessPartner |
| Purchase Orders | WAREHOUSEINBOUNDDELIVERY_0001 | WhseInboundDeliveryHead |
| Stock Transfers | API_WAREHOUSE_ORDER_TASK_2 | WarehouseTask |
| Stock Adjustments | API_WHSE_PHYSINVTRYITEM_2 | WhsePhysInventoryItem |

OData path convention: `https://<tenant>/sap/opu/odata/sap/<SERVICE_NAME>/`

## Refused

- Product images / 3D assets / file URLs
- Supplier banking details / IBAN / payment terms
- BOM / kit components / work orders / production orders
- Cost-method internals (FIFO / LIFO / moving-average)
- Customer-facing order or sales data
