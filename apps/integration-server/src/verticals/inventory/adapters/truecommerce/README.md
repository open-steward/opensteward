# TrueCommerce adapter

Inventory vertical adapter for TrueCommerce Foundry — a cloud supply-chain
platform with an API-first architecture.

Auth: OAuth 2.0 client_credentials grant (Auth0-backed identity layer).
Credentials: `clientId` + `clientSecret` issued from the TrueCommerce Foundry
developer portal.  Tokens are short-lived; the adapter auto-refreshes on
expiry using the stored client credentials.

Webhook: TrueCommerce does not publish a documented HMAC/JWT signing scheme
for external webhook consumers — `webhook.ts` is intentionally absent.

## Supported resources
- Products (`/v1/products`)
- Inventory / stock levels (`/v1/inventory`)
- Locations (`/v1/locations`)
- Trading partners / suppliers (`/v1/trading-partners`)
- Purchase orders (`/v1/purchase-orders`)
- Stock transfers (`/v1/stock-transfers`)
- Stock adjustments (`/v1/stock-adjustments`)

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
