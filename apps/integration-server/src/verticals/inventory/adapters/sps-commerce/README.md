# SPS Commerce adapter

SPS Commerce is the largest retail EDI network (50,000+ trading partners), providing cloud-based supply chain and inventory management via REST APIs and EDI data exchange.

Auth: OAuth2 client credentials (machine-to-machine) via Auth0.
- Token URL: `POST https://api.spscommerce.net/authorization/v1/token`
- Grant type: `client_credentials`
- Header: `Authorization: Bearer <token>`

Base URL (prod): `https://api.spscommerce.com`
Base URL (sandbox): `https://integration.api.spscommerce.com`

## Coverage

| Resource | Supported |
|---|---|
| Products / Items | listProducts, getProduct |
| Stock Levels (Inventory Advise / EDI 846) | listStockLevels |
| Locations | listLocations, getLocation |
| Vendors / Suppliers | listSuppliers, getSupplier |
| Purchase Orders (EDI 850) | listPurchaseOrders, getPurchaseOrder |
| Stock Transfers | not available in public API |
| Stock Adjustments | not available in public API |
| Webhooks | not publicly documented |

## Pagination

SPS Commerce uses offset-based pagination per their REST API standards:
- Query params: `limit`, `offset`
- Response envelope: `{ results: [...], paging: { limit, offset, totalCount, next } }`

## Unsupported Resources

- **StockTransfers** — The SPS Commerce public REST API does not expose a stock-transfer (inventory-movement / transfer-order) endpoint. SPS Commerce is primarily a retail EDI network; warehouse transfer records between locations are not part of the public API surface. A forward-compatibility transform exists at `transform/stock-transfer.ts` but is not wired into `index.ts`.
- **StockAdjustments** — The SPS Commerce public REST API does not expose a stock-adjustment (inventory correction / cycle-count) endpoint. The Fulfillment API provides on-hand inventory positions via the EDI 846 Inventory Advisory (`/inventory-advises`) but does not expose individual adjustment records or the reason/delta history for quantity changes. A forward-compatibility transform exists at `transform/stock-adjustment.ts` but is not wired into `index.ts`.
- **Webhooks** — SPS Commerce does not provide a publicly documented signed-webhook scheme for the Fulfillment REST API.

## References

- API Standards: https://spscommerce.github.io/sps-api-standards/
- API Reference: https://docs.api.spscommerce.com/
- Dev Center: https://developercenter.spscommerce.com/
