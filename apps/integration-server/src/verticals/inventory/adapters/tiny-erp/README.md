# Olist Tiny ERP adapter

Inventory adapter for [Olist Tiny ERP](https://tiny.com.br) (slug: `tiny-erp`).

Auth: OAuth 2.0 Authorization Code flow via Keycloak-hosted identity provider at `accounts.tiny.com.br`.

## Supported resources

| Resource | Endpoints |
|---|---|
| Products | `GET /produtos`, `GET /produtos/{id}` |
| StockLevels | `GET /estoque/{idProduto}` (per-product with deposito breakdown) |
| Locations | `GET /depositos`, `GET /depositos/{id}` |
| Suppliers | `GET /contatos`, `GET /contatos/{id}` |
| PurchaseOrders | `GET /ordem-compra`, `GET /ordem-compra/{id}` |

Base URL: `https://api.tiny.com.br/public-api/v3`.

## Unsupported Resources

- **StockTransfers** — the Tiny v3 public API (`api.tiny.com.br/public-api/v3`) has no endpoint for inter-deposito transfer records; the platform routes stock moves through sales/purchase order fulfilment only
- **StockAdjustments** — the Tiny v3 public API does not expose a dedicated stock-adjustment endpoint; ad-hoc inventory corrections are internal to the ERP and not surfaced via the REST API

## Not supported

- **listStockLevels** — Tiny only returns stock per-product; call `getStockLevel(productId)` instead
- **Webhooks** — Tiny v3 does not document HMAC/JWT signing for outbound webhooks

## Refused (schema firewall)

- Product images / attachment URLs
- Supplier banking / payment terms
- BOM / kit components / fabricado details
- Manufacturing work orders / production stages
- Customer-facing sales order data
