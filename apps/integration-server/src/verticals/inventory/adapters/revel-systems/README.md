# Revel Systems inventory adapter

Revel Systems is a cloud POS and inventory platform for restaurants and retail.

Auth: OAuth2 client_credentials. Token endpoint `https://authentication.revelup.com/oauth/token`. No user-facing authorization URL. Tokens live ~24 h and are proactively refreshed. Credentials require clientId, clientSecret, and the merchant subdomain.

Base URL: `https://{subdomain}.revelup.com/resources/`

Pagination: `?limit=N&offset=N` → `{ meta: { total_count, limit, offset, next, previous }, objects: [...] }`

Resource mapping:
- Product          → Product (sellable items)
- Ingredient       → StockLevel (raw/prep items tracked for inventory)
- Establishment    → Location (POS stores)
- Vendor           → Supplier
- PurchaseOrder    → PurchaseOrder
- InventoryTransfer → StockTransfer
- InventoryAdjustment → StockAdjustment

Webhook: HMAC-SHA1 over body, header `X-Revel-Signature` (hex). Event types: `inout.stock`, `menu.updated`.

## Refused
- Product images / media
- Supplier banking details / payment terms
- Recipe / BOM components
- Customer-facing order data
- Cost-method internals
