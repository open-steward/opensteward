# ECCANG adapter

ECCANG (易仓科技) is a cross-border e-commerce ERP/WMS platform.

Auth: api_key flow — three credentials required: `appKey`, `token` (user/tenant access token), and `subjectCode` (tenant identifier). All are surfaced via `credentialFields()`.

API: unified POST gateway at `https://open.eccang.com/openApi/api/appUnity`. Each operation is selected by the `interface_method` field in the request body.

Webhook: no HMAC/JWT signing documented in the public Open API; `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order data
