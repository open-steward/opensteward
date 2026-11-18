# Supy adapter

Multi-branch F&B inventory and procurement platform for restaurants.

Auth: single API key sent as the `x-api-key` header. Connect Link surfaces it via `credentialFields()`.

Webhook: not implemented — Supy does not publish HMAC/JWT webhook signing documentation in its public-facing API reference.

## Resources

- **items** → Products (`/items`)
- **branches** → Locations (`/branches`)
- **suppliers** → Suppliers (`/suppliers`)
- **purchase-orders** → PurchaseOrders (`/purchase-orders`)
- **inventory/balances** → StockLevels (`/inventory/balances`)
- **transfers** → StockTransfers (`/transfers`)
- **stock-adjustments** → StockAdjustments (`/stock-adjustments`, covers stock takes + wastage)

## Refused

- Product images / recipe compositions
- Supplier banking details
- BOM / kit components / production workflows
- Customer-facing order data
- Cost-method internal details
