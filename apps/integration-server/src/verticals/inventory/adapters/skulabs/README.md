# SKULabs adapter

Multi-channel order management + warehouse inventory adapter for the inventory vertical.

Auth: static API key sent as `Authorization: Bearer <key>` header. Connect Link surfaces the key via `credentialFields()`.

Webhooks: SKULabs supports outbound webhook delivery (POST `https://api.skulabs.com/webhook/add_handler`) but does not document an HMAC or JWT signature scheme for incoming payloads. `verifyWebhook` and `parseWebhookEvents` are not implemented.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
