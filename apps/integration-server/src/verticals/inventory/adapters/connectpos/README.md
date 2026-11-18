# ConnectPOS adapter

ConnectPOS is a Magento 2 POS system (SM_XRetail module). Its REST API is
served from `{storeUrl}/xrest/index/v1?path={resource}`.

Auth: Bearer JWT access token. Obtained from the Magento Admin panel (Integrations
→ ConnectPOS) or via POST `?path=token` with Magento admin credentials.
Stored as `apiKey`; storeUrl (Magento base URL) is stored in `extra.storeUrl`.

## Supported resources
- Products — `?path=product`
- Stock levels — `?path=warehouse-item` (per-warehouse qty)
- Locations (outlets) — `?path=outlet`

## Not supported
- Suppliers (no xrest endpoint)
- Purchase orders (no xrest endpoint)
- Stock transfers (BMS integration endpoint is write-only)
- Stock adjustments (no xrest endpoint)
- Webhooks (no documented HMAC signing)

## Refused
- Product images / media gallery URLs
- POS shift / cash drawer data
- Payment transaction details
- Customer PII beyond what catalog exposes
