# E2open adapter

E2open Supply Chain Platform — multi-enterprise supply chain network.

Auth: OAuth 2.0 Bearer (Authorization Code Flow or Client Credentials for server-to-server). Token endpoint: `https://login.e2open.com/e2open/as/token.oauth2`.

Base URL: `https://api.e2open.com`

API: Channel Data Management (CDM) REST API v1 — `/cdm/v1/transactions` for Inventory and PurchaseOrder entities.

Webhook: No HMAC/JWT webhook signing documented for supply chain events. `verifyWebhook` and `parseWebhookEvents` are not implemented.

## Supported resources
- products (CDM Inventory entity — item master)
- stock-levels (CDM Inventory entity — on-hand positions)
- purchase-orders (SCC Discrete Order Collaboration)

## Refused / not implemented
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
- Locations (no standalone public REST list endpoint)
- Stock transfers (SCC Shipment Collaboration requires separate entitlement)
- Stock adjustments (CDM adjustment transactions require separate entitlement)
