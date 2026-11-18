# Kinaxis Maestro adapter

Inventory adapter for Kinaxis Maestro (formerly RapidResponse), a supply chain orchestration platform.

Auth: OAuth2 (authorization_code for user-facing flows; client_credentials for server-to-server). Tenant-scoped — every customer's auth server and API live at `{tenant}.kinaxis.com`. The tenant slug is stored in `credentials.extra.tenant`.

Webhook: Kinaxis Maestro does not document a public HMAC or JWT webhook signing scheme. Webhook support is not implemented.

## Entity mapping

| Maestro table           | OpenSteward entity |
|-------------------------|--------------------|
| Part                    | Product            |
| OnHandInventory         | StockLevel         |
| Site                    | Location           |
| Supplier                | Supplier           |
| PurchaseOrder           | PurchaseOrder      |
| Transfer                | StockTransfer      |
| InventoryAdjustment     | StockAdjustment    |

## Refused

- Product images / 3D assets / file URLs
- Supplier banking / payment terms
- BOM / routing / work orders (manufacturing schema — refused)
- Demand planning / forecast data
- Cost-method internal details
- Customer-facing demand order data
