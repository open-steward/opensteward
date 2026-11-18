# StockTrim adapter

Demand-forecasting and inventory optimisation platform (smarter inventory planning).

Base address: `https://api.stocktrim.com/api`

Auth: two custom headers per the official StockTrim API docs, found under Help → API Connection Settings in the StockTrim portal:
- `api-auth-id` — tenant UUID (e.g. `443ba0f7-1123-765z-b697-a5411bad47fa`)
- `api-auth-signature` — tenant name (e.g. `apitest`)

Connect Link surfaces both via `credentialFields()`.

## Supported resources
- Products (read)
- Stock levels (derived from product `stockLocations` array; per-location `stockOnHand`/`stockOnOrder`)
- Locations
- Suppliers
- Purchase orders (`GET /api/V2/PurchaseOrders`)

## Unsupported Resources

The following canonical inventory resources are NOT exposed by the StockTrim
REST API. The interface methods are optional; the adapter omits them entirely
(router returns 501 automatically). Transform stubs are present for
forward-compatibility should StockTrim add read endpoints in a future revision.

| Resource          | Reason not available                                                              |
|-------------------|-----------------------------------------------------------------------------------|
| Stock Adjustments | No adjustment-document endpoint; corrections applied via Products POST `stockOnHand` |
| Stock Transfers   | No inter-location transfer endpoint exists in the StockTrim API                   |
| Webhooks          | Not documented in the StockTrim public API                                        |

## Refused (schema-firewall)
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / manufacturing work orders
- Cost-method internal details
- Customer-facing sales order data
