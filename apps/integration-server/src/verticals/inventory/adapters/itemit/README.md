# itemit adapter

Cloud asset-tracking platform for the inventory vertical.

Auth: four custom headers — `X-Api-Key`, `X-User-Id`, `X-User-Token`, `X-Workspace-Id`.
All four are provided via `credentialFields()`.

Base URL: `https://api.itemit.com/v1`

## Supported resources

| OpenSteward resource | itemit source |
|---|---|
| Products | `POST /item-profiles/_search` — physical asset records |
| Locations | `GET /location-profiles` — named storage/tracking locations |

## Unsupported Resources

- **StockLevels** — itemit is a discrete asset-tracking platform, not a fungible-quantity inventory system. Each asset is an individual tracked entity; there is no on-hand quantity or stock-level endpoint in the itemit API.
- **Suppliers** — itemit has no supplier or vendor resource in its public API. The data model tracks physical asset custody and location, not procurement relationships.
- **PurchaseOrders** — itemit has no purchase-order resource. Procurement workflows are handled outside itemit; the API exposes no PO endpoint.
- **StockAdjustments** — itemit has no stock-adjustment concept. Assets are created or archived individually; there is no bulk quantity adjustment endpoint.
- **StockTransfers** — itemit has no stock-transfer resource. Moving an asset between locations is recorded as a location-change event on the item, not as a discrete transfer document.
- **Webhooks** — itemit does not document a webhook or event-subscription endpoint; no HMAC signing scheme is available.

## Schema-firewall

- Product images / file attachment URLs are not passed through
- Cost and pricing data are not exposed by the itemit API
- Custody-chain / check-in-check-out audit logs are not exposed
