# GoFrugal RetailEasy adapter

On-premises retail POS / ERP platform widely deployed in India and the Middle East.

Auth: Static API key sent as `X-Auth-Token` header. The WebReporter service URL
is per-installation (e.g. `http://192.168.1.100:8482/WebReporter`), so the
customer must supply `baseUrl` alongside their `apiKey` during onboarding.

Webhook: GoFrugal does not document a webhook signing mechanism. `verifyWebhook`
always returns `false`.

## Supported resources

- **Products** — `GET /api/v1/items` (item master with embedded per-location stock)
- **StockLevels** — derived from `/api/v1/items` (sum of stock[] entries per locationId)
- **Locations** — derived from `/api/v1/items` (unique locationIds collected from items)

## Not supported (no public endpoint documented)

- Suppliers
- Purchase Orders
- Stock Transfers
- Stock Adjustments

## Refused (schema-firewall)

- Product images / file URLs
- Supplier banking / payment terms
- Customer-facing sales order data
- Cost-method internal details
