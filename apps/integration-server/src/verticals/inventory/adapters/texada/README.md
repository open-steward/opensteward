# Texada adapter

Inventory adapter for Texada CloudLink — an equipment rental and fleet
management platform (SRM + CloudLink).

Auth: API key + tenant slug. The API key is exchanged for a short-lived
Bearer token via `POST /auth` (header `x-api-key`). Both credentials are
surfaced via `credentialFields()`.

Base URL: `https://use-api.cloudlink.texadasoftware.com/v1/{tenant}/`

Pagination: zero-based `?page=N&size=N` (max 1000 per page).

Webhook: Texada does not document HMAC/JWT-signed webhook delivery;
`verifyWebhook` and `parseWebhookEvents` are intentionally omitted.

## Supported resources
- Products (equipment models / items)
- Stock levels (per branch / depot)
- Locations (branches / depots)
- Suppliers (vendors)
- Purchase orders
- Stock transfers (branch transfers)
- Stock adjustments

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- Manufacturing BOM / work orders
- Customer rental order / contract data
- Cost-method internal details
