# Vend POS adapter (Lightspeed Retail X-Series)

Lightspeed acquired Vend in 2021 and rebranded the product as "Lightspeed Retail X-Series". The API is hosted at `retail.lightspeed.app`.

## Auth

OAuth 2.0 authorization-code grant.

| | |
|---|---|
| Authorization URL | `https://secure.retail.lightspeed.app/connect` |
| Token URL | `https://{domain_prefix}.retail.lightspeed.app/api/1.0/token` |
| API base | `https://{domain_prefix}.retail.lightspeed.app/api/2.0` |

The `domain_prefix` is the retailer's store subdomain (e.g. `mystore` from `mystore.vendhq.com`). It must be stored in `credentials.extra.domainPrefix` after the code exchange and is used to build the per-tenant base URL.

Scopes used: `products:read inventory:read outlets:read suppliers:read consignments:read`

## Webhook

Signature header: `X-Signature`  
Format: `signature=<hex>,algorithm=HMAC-SHA256`  
Key: OAuth application `client_secret`  
Body encoding: `application/x-www-form-urlencoded` UTF-8

## Pagination

v2.0 uses cursor-based pagination via a monotonically-increasing `version` integer:

```
GET /api/2.0/products?after=<version.max>&page_size=200
```

Repeat with `after=version.max` until the response `data` array is empty.

## Resources

| Canonical resource | Vend endpoint |
|---|---|
| Products | `GET /api/2.0/products` |
| Stock levels | `GET /api/2.0/inventory` |
| Locations | `GET /api/2.0/outlets` |
| Suppliers | `GET /api/2.0/suppliers` |
| Purchase orders | `GET /api/2.0/consignments?type=SUPPLIER` |
| Stock transfers | `GET /api/2.0/consignments?type=OUTLET` |
| Stock adjustments | `GET /api/2.0/consignments?type=STOCKTAKE` |

Stock adjustments are modelled as inventory-count (STOCKTAKE) consignments, which is the correct v2.0 mechanism. The `/stock-adjustments` path was introduced in a later API version (2026-01) and is not available in v2.0.

## Currency

Vend is a multi-currency POS. Currency is configured per outlet (`currency` field on the outlet object) and is **not** present on individual product records. The `retailPrice` field on canonical products is omitted when the outlet currency cannot be determined from the product payload alone.

## Refused

- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components (Vend does not expose these via v2.0 API)
- Cost-method internal details
- Customer-facing order / sale data
