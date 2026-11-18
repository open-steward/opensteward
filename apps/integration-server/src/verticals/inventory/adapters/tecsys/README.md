# Tecsys OrderDynamics adapter

Inventory adapter for Tecsys OrderDynamics (OmniOMS), a cloud-native order and
inventory management platform by Tecsys Inc.

Auth: OAuth2 client_credentials via Azure Active Directory. The customer creates
an Azure App Registration, grants it the `https://api.orderdynamics.net/.default`
scope, and supplies tenantId + clientId + clientSecret via `credentialFields()`.

Webhook: Tecsys OrderDynamics does not publish a documented HMAC/JWT
webhook-signing scheme; `verifyWebhook` and `parseWebhookEvents` are not
implemented.

## Supported resources
- Products (`/v1/items`)
- Stock levels (`/v1/inventory/BulkOnhand`)
- Locations (`/v1/inventorylocations`)
- Purchase orders (`/v1/orders?orderType=PurchaseOrder`)

## Not supported
- Suppliers (no public list endpoint)
- Stock transfers (no dedicated public endpoint)
- Stock adjustments (no public write-back endpoint)
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Customer-facing order data
