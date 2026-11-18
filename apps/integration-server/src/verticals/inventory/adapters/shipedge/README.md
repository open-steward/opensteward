# ShipEdge adapter

WMS + OMS inventory integration for ShipEdge.

Auth: API key (body param `key`) + Account ID (`account_id`) + Warehouse identifier (`warehouse`) + Integration slug (tenant subdomain). All four fields are collected via `credentialFields()`.

Two API families are used:
- **Inventory v2** (`POST` to `https://<integration>.shipedge.com/API/Rest/v2/Inventory/*`) — auth in request body.
- **Replenishment v3** (`GET`/`POST` to `https://<integration>.shipedge.com/API/Rest/v3/Replenishment/*`) — HMAC auth headers (`X-UID`, `X-TIMESTAMP`, `X-KEY` = SHA1 of accountId+timestamp+rawKey).

## Supported resources

| Resource        | Methods              | Notes |
|-----------------|----------------------|-------|
| Products        | list, get            | `/get_products`, `/get_product` |
| Stock Levels    | list, get            | Derived from product quantity fields; no dedicated endpoint |
| Purchase Orders | get (by reple_id)    | Replenishment v3 `/get_reple` |

## Not supported (no public endpoint)

- Locations — distribution_center inline on products only; no list endpoint
- Suppliers — name string on replenishment records; no list endpoint
- Stock Transfers — no public endpoint documented
- Stock Adjustments — no public endpoint documented
- Webhooks — no documented HMAC/JWT signing

## Refused (schema firewall)

- Product images / file URLs
- Supplier banking / payment terms
- Cost-method internal details
- Customer-facing order data
