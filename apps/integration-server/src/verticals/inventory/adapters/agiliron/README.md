# Agiliron adapter

Agiliron is a multi-channel inventory + ERP platform for SMBs.

Auth: API key passed as the `key` query parameter and the `apiKey` header on
every request. The company subdomain is required to build the base URL:
`https://{company}.agiliron.net/agiliron/api-40/`.

Webhooks: Agiliron does not document HMAC/JWT signing for webhook payloads;
`verifyWebhook` / `parseWebhookEvents` are therefore not implemented.

## Supported resources
- Products (`GET /Products`)
- Stock levels (`GET /ProductsInventory`)
- Locations (derived from `StockLocation` strings on inventory records)
- Suppliers/Vendors (`GET /Vendor`)
- Purchase orders (`GET /PurchaseOrders`)
- Stock transfers (`GET /InventoryTransfer`)

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
