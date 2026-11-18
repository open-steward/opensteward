# Manhattan Active WM adapter

Inventory vertical adapter for Manhattan Active® Warehouse Management.

Auth: OAuth 2.0 Resource Owner Password Credentials Grant.
  Token endpoint: `https://<env>-auth.omni.manh.com/oauth/token`
  API base:       `https://<env>.omni.manh.com/api`

Credential fields: `environment`, `clientId`, `clientSecret`, `username`, `password`.

Webhook: Manhattan Active WM does not expose a documented public webhook
  signature scheme — `verifyWebhook` / `parseWebhookEvents` are not implemented.

## Supported resources
- Products (items): `GET /wm/v1/items`
- Stock levels (per-item inventory by location): `GET /wm/v1/items/{itemId}/inventory`
- Locations: `GET /wm/v1/locations`
- Suppliers: `GET /wm/v1/suppliers`
- Purchase orders: `GET /wm/v1/purchase-orders`
- Stock transfers (inventory transfers): `GET /wm/v1/inventory-transfers`
- Stock adjustments (inventory adjustments): `GET /wm/v1/inventory-adjustments`

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
- Manufacturing / labor / yard management endpoints
