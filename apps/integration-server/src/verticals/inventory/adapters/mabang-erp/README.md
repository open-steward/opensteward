# Mabang ERP adapter

Inventory adapter for Mabang ERP (马帮ERP), a Chinese cross-border e-commerce ERP platform.

Auth: HMAC-SHA256 per-request signature (developer key pair). Each POST body includes
`{ developerId, timestamp, action, ...params }`. The `Authorization` header carries the
hex-encoded HMAC-SHA256 of the serialised JSON body, keyed by the developer secret.

Docs: https://wiki.mabangerp.com/developer_api.htm

## Supported resources

| Resource           | Action                  |
|--------------------|-------------------------|
| Products           | `do-search-stockSku`    |
| Stock Levels       | `get-stock-quantity`    |
| Purchase Orders    | `get-purchase-list`     |
| Stock Adjustments  | `get-storage-log-data`  |

## Unsupported Resources

- **location**: The Mabang ERP open API does not expose a warehouse/location listing endpoint. Warehouse identifiers appear only as contextual fields on stock-level and purchase-order records. A `transform/location.ts` is therefore not present and should not be created.
- **supplier**: The Mabang ERP open API has no dedicated supplier-list endpoint. Supplier names and IDs appear only as contextual fields on purchase-order records. A `transform/supplier.ts` is therefore not present and should not be created.
- **stock-transfer**: The Mabang ERP open API has no transfer-listing or inter-warehouse-movement endpoint. A `transform/stock-transfer.ts` is therefore not present and should not be created.
- **webhook**: Webhooks / push event subscriptions are not documented in the Mabang ERP open API. `parseWebhookEvents` is not implemented.

## Refused by schema-firewall
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
