# Extensiv Order Manager adapter

Multi-channel order management + warehouse inventory (formerly Skubana).

Auth: OAuth2 authorization_code grant. Authorization endpoint: `app.skubana.com/oauth/authorize`; token endpoint: `app.skubana.com/oauth/token` (params sent as URL query string including `cid` returned alongside the auth code). Token request Authorization header: Basic base64(appKey:appSecret). API calls use Bearer tokens against `api.skubana.com`.

Webhooks: not implemented — Extensiv Order Manager does not publish an HMAC webhook signing scheme.

## Unsupported Resources

- **StockAdjustments** — Extensiv Order Manager has no stock-adjustment endpoint in its public REST API (`api.skubana.com`). Inventory quantity corrections are applied through the Order Manager UI or via the channel-inventory acknowledgment flow (`POST /service/v1.2/inventory/acknowledge`), which pushes channel-level deltas but does not expose an adjustment-record resource that can be listed or fetched.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- Manufacturing BOM / kit components
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing sales order data
