# Openbravo adapter

Openbravo is an open-source / cloud ERP for retail and distribution.

Auth: HTTP Basic (username + password + customer-specific host URL). Credentials are supplied via `credentialFields()`.

API: JSON REST Web Services at `{host}/openbravo/org.openbravo.service.json.jsonrest/{Entity}`. Pagination via `_startRow` / `_endRow`. Response envelope: `{ response: { status: 0, data: [...], totalRows: N } }`.

Webhook: Openbravo has no documented HMAC/JWT push-webhook signing. `verifyWebhook` returns `false` by default.

## Supported resources
| Resource | Openbravo entity |
|---|---|
| products | `Product` |
| stock-levels | `MaterialMgmtStorageDetail` |
| locations | `Warehouse` |
| suppliers | `BusinessPartner` (vendor=Y) |
| purchase-orders | `Order` (salesTransaction=N) |
| stock-transfers | `InternalMovement` |
| stock-adjustments | `MaterialMgmtInventoryCount` |

## Refused
- Product images / 3D assets / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders / manufacturing
- Cost-method internal details (FIFO/LIFO/avg)
- Customer-facing order data (salesTransaction=Y orders)
