# Crunchtime adapter

Restaurant back-office platform (net-chef.com) — inventory, purchasing, recipes, and labor for enterprise food-service chains.

Auth: 4-header credential scheme — `authenticationtoken` (provisioned by Crunchtime support), `sitename`, `userid`, `password`. No standard OAuth2 flow.

Base URL: `https://webservices.net-chef.com`

## Supported resources
- Products (`/companyproduct/v1/`)
- Stock Levels (`/inventory/v1/getCurrentInventoryByPage`)
- Locations (`/location/v1/`)
- Suppliers/Vendors (`/vendor/v1/`)
- Purchase Orders (`/purchaseorder/v1/`)
- Stock Adjustments (`/inventory/v1/getInventoryAdjustmentsByPage`)

## Not supported
- Stock Transfers — no public endpoint documented in the Crunchtime developer portal
- Webhooks — no documented HMAC/JWT signing; webhook support not implemented

## Refused (schema-firewall)
- Product images / recipe media
- Supplier banking details / payment terms
- BOM / kit components / recipe component costing details
- Customer-facing order data (POS sales)
