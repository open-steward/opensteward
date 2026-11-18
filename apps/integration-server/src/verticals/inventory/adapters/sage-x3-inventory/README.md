# Sage X3 inventory adapter

Sage X3 (Sage Enterprise Management) — mid-market / enterprise ERP.

Auth: OAuth2 authorization_code flow. Token endpoint at `<authServerUrl>/oauth2/token`.
Base URL: `https://<tenant>/api1/x3/erp/<FOLDER>` (SData 2.0 / api1 protocol).

Webhook: Sage X3 does not publish HMAC/JWT signing for webhooks. `verifyWebhook`
always returns `false`. Use network-level controls (IP allowlist, mTLS) instead.

## Supported resources

| Resource         | Representation  | Notes                                          |
|------------------|-----------------|------------------------------------------------|
| products         | ITMMASTER       | Full product master                            |
| stock-levels     | STKCNSSDIM      | Stock consolidated by product + site           |
| locations        | STOLOC          | Storage locations (bins, sites)                |
| suppliers        | BPSUPPLIER      | Supplier business partners                     |
| purchase-orders  | PORDER          | Purchase order headers + lines                 |
| stock-transfers  | MISREC          | Inter-site transfer / miscellaneous receipt    |
| stock-adjustments| INVADJ          | Inventory adjustment / count vouchers          |

## Refused

- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details (FIFO/LIFO/average)
- Customer-facing order data
