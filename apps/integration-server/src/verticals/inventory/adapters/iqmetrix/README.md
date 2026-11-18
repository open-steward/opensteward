# iQmetrix adapter

Retail management platform for the telecom/wireless accessories industry (RQ POS + Distributor Central).

Auth: OAuth 2.0 resource-owner password grant. Credentials include clientId, clientSecret, username, password, and companyId from the iQmetrix onboarding package. Access tokens expire in ~12 h and are refreshed via refresh_token grant.

iQmetrix uses a micro-service topology — each resource lives on a different base URL:
- Catalog (products): `catalogsrc.iqmetrix.net/v1`
- Availability (stock levels): `availabilityrc.iqmetrix.net/v1`
- Entity Manager (locations, vendors): `entitymanagerrc.iqmetrix.net/v1`

Supported resources: products, stock-levels, locations, suppliers.

Webhooks: not documented by iQmetrix for retail partners — returns false/[].

## Unsupported Resources

- **StockTransfers** — iQmetrix RQ POS does not expose a public REST endpoint for reading or listing inter-store transfers. Stock transfer records are managed internally by the RQ system; no `GET` API is documented for third-party retail partners. `listStockTransfers` and `getStockTransfer` are not implemented.
- **PurchaseOrders** — The iQmetrix RQ purchase-orders API (`POST /rqpurchaseorders/Companies/{id}/PurchaseOrders`) is write-only. No public `GET` or list endpoint for existing purchase orders is documented for retail partners.
- **StockAdjustments** — The iQmetrix RQ inventory-adjustments API (`POST /rqinventoryadjustment/Companies/{id}/QuantityAdjustment`) is write-only. No public `GET` or list endpoint for existing adjustments is documented.

## Schema-firewall

- Product images / 3D assets / file URLs are not passed through
- Supplier banking details / payment terms are not exposed
- Customer-facing order / sales data is not exposed
