# Boxstorm adapter

Boxstorm is the cloud-hosted edition of Fishbowl Advanced inventory management.

Auth: Bearer token supplied as `apiKey` credential field. Tokens are pre-generated
from Boxstorm Settings > Integrations, or obtained via `POST /api/login`.

Webhooks: not implemented — Boxstorm does not document HMAC/JWT webhook signing.

## Supported resources
- Products (parts) — `GET /api/parts`
- Stock levels (inventory) — `GET /api/parts/inventory`
- Suppliers (vendors) — `GET /api/vendors`
- Purchase orders — `GET /api/purchase-orders`

## Unsupported Resources

The following resources **cannot** be implemented because the Boxstorm REST API
provides only write-only endpoints for them (no list or fetch endpoint exists):

- **Stock Transfers** — `POST /api/inventory/move` is write-only; no list API
  is available to read historical transfers back.
- **Stock Adjustments** — `POST /api/inventory/adjust` is write-only; no list
  API is available to read historical cycle-count or adjustment records back.
- **Locations** — Boxstorm does not expose a REST list endpoint for warehouses
  or location-groups in the current API version.

`transform/stock-transfer.ts` and `transform/stock-adjustment.ts` are unwired
stubs because Boxstorm exposes no read endpoints for these resources.

## Refused (schema-firewall)
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Cost-method internal details
- Customer-facing order data
