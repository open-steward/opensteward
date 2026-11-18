# Kladana adapter

Russian cloud ERP / inventory management system.

Auth: Bearer token (API key) via `Authorization: Bearer <token>` header. Connect Link surfaces it via `credentialFields()`.
Docs: https://dev.kladana.com/doc/api/remap/1.2/

Webhooks: not implemented — Kladana does not document HMAC/JWT signing for webhook payloads.

## Amounts
All monetary values are in integer minor units (kopecks). Stored as-is; no conversion needed.

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order data
