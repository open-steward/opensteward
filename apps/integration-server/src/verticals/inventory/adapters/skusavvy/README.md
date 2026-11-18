# SKUSavvy adapter

Inventory adapter for SKUSavvy, a GraphQL-native WMS focused on Shopify / ecommerce warehouses.

Auth: single API token sent as `X-Token` header. Connect Link surfaces this via `credentialFields()`.

Webhooks: not documented by SKUSavvy — `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
