# Cin7 Core adapter

Reference implementation for the inventory vertical. Formerly DEAR Systems.

Auth: API key + account ID pair, both sent as headers (`api-auth-applicationkey` + `api-auth-accountid`). Connect Link surfaces both via `credentialFields()`.

Webhook: HMAC-SHA256 over body, header `X-Cin7-Signature` (hex).

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders (Cin7 Core has BOM endpoints — refused)
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
