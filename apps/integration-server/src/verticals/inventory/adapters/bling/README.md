# Bling adapter

Brazilian ERP with strong e-commerce integrations (Mercado Livre, Shopify, etc.).

Auth: OAuth2 authorization-code grant. Authorize endpoint: `GET /Api/v3/oauth/authorize`. Token endpoint: `POST /Api/v3/oauth/token`. Access token expires in 6 h; refresh token in 30 days.

Base URL: `https://api.bling.com.br/Api/v3`

Webhook: HMAC-SHA256 over body with client_secret, header `X-Bling-Signature-256: sha256=<hex>`.

## Supported resources
- Products (`/produtos`)
- Stock levels (`/estoques/saldos`, flattened per deposit)
- Locations / deposits (`/depositos`)
- Suppliers (`/contatos/tipos` to resolve the "Fornecedor" contact type id, then `/contatos?idTipoContato=<id>&criterio=1`)
- Purchase orders (`/pedidos/compras`)

## Unsupported Resources

- **StockTransfers** — Bling v3 has no stock-transfer resource. Inter-deposit movement is reflected in the `/estoques/saldos` balances but there is no API endpoint that returns individual transfer records or transfer lines. Implement via balance polling only.
- **StockAdjustments** — Bling v3 has no stock-adjustment endpoint. Inventory corrections are applied internally and only the resulting `/estoques/saldos` balance is queryable; no adjustment log or audit trail is exposed via the public API.

## Schema-firewall

- Product images / file URLs are not passed through
- Supplier banking details / payment terms are not surfaced
- Cost-method internal details are not surfaced
- Customer-facing order data (pedidos/vendas) is excluded
