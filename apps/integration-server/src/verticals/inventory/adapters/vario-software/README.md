# VARIO Cloud adapter

VARIO Cloud ERP/WMS adapter for the inventory vertical.

Auth: OAuth 2.0 password grant. Credentials: tenant slug, clientId, clientSecret, username, API password. Token exchanged via `https://sso.vario.cloud/realms/{tenant}/protocol/openid-connect/token`. All requests carry `Authorization: Bearer <token>` and a required `User-Agent` header.

Rate limit: 40 req / 6 s — retries honour `x-rate-limit-retry-after-seconds`.

Pagination (VQL POST body): `limit` + `offset` fields; response headers `x-query-more-elements` / `x-query-next-offset`.
Pagination (stockjournal REST): JSON-serialised query params — `selection={"type":"..."}` and `pageable={"_start":N,"_limit":N}`.

Webhook: NOT documented (marked "coming soon") — no webhook implementation.

## Supported resources
- products (articles) — via VQL + GET /erp/articles/{id}
- stockLevels — GET /erp/articles/{id}/stocks
- locations (storages) — via VQL + GET /erp/storages/{id}
- suppliers (article-supplier relations) — via VQL + GET /erp/article-suppliers/{id}
- purchaseOrders (order proposals) — via VQL + GET /erp/order-proposals/{id}
- stockTransfers — GET /erp/stocks/stockjournal?type=DOCUMENT
- stockAdjustments — GET /erp/stocks/stockjournal?type=MANUAL

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / fabrication work orders
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data
