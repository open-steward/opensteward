# Webgility Connect adapter

Ecommerce-to-accounting integration platform that syncs orders, items, and
vendors from online channels (Shopify, Amazon, eBay, WooCommerce, etc.) to
QuickBooks Online and Xero.

Auth: appKey + appSecret exchanged for an AccessToken via POST /v1/appusers.
The AccessToken is sent as `Authorization: Bearer <token>` on every call.

Webhooks: no webhook signing documented; webhook.ts is not present.

## Supported resources
- Products     — GET /v1/items
- Stock levels — synthetic, derived from Item.QBQtyOnHand (no dedicated endpoint)
- Suppliers    — GET /v1/vendors
- PurchaseOrders — GET /v1/invoices (AP invoices mapped to PO schema)

## Not supported
- Locations (no warehouse/location endpoint in Webgility Connect API)
- Stock transfers (no endpoint)
- Stock adjustments (no endpoint)

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Customer-facing order data
