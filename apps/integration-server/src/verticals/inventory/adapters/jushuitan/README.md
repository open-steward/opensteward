# Jushuitan (聚水潭) adapter

Chinese SaaS ERP and WMS platform. Widely used by e-commerce sellers on Taobao, JD.com, and Douyin.

Auth: `app_key` + `app_secret` + `access_token`. All requests are POST to `https://openapi.jushuitan.com/<path>` with form-encoded body. Business parameters are JSON-serialised into the `biz` field. Signature = MD5(appSecret + ksort(key+value pairs)).

Webhook: No HMAC/JWT webhook signing documented in the public API. `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Supported resources

- Products (`/open/sku/query`)
- Stock levels (`/open/inventory/query`)
- Locations / warehouses (`/open/wms/partner/query`)
- Suppliers (`/open/supplier/query`)
- Purchase orders (`/open/purchase/query`)
- Stock adjustments / inventory counts (`/open/inventory/count/query`)

## Not supported

- Stock transfers — no public endpoint documented
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Customer-facing order data
