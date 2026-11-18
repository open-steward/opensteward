# Orderful adapter

Orderful is a modern EDI platform for B2B document exchange (850 purchase orders, 846 inventory advice, 856 ASNs, 810 invoices, etc.).

Auth: Single API key passed as the `orderful-api-key` header. Key is generated in the Orderful UI under Organization Settings > API Credentials.

Base URL: `https://api.orderful.com/v3`

Pagination: cursor-based. Each page's `metadata.pagination.links.next` carries the `nextCursor` for the page after it, and is null on the last page. `GET /v3/relationships` takes a `limit` of at most 100. `GET /v3/transactions` takes no page size at all and returns at most 100 transactions a page.

## Supported resources

| OpenSteward resource | Orderful source                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PurchaseOrders       | `GET /v3/transactions?transactionType=850_PURCHASE_ORDER`                                                                                                                                                                            |
| StockLevels          | Refused (501 NOT_SUPPORTED). No stock-level resource: stock arrives only inside 846 documents, whose content format depends on the relationship (X12, EDIFACT or JSON), and the published Mosaic 846 schema has no on-hand quantity. |
| Suppliers            | `GET /v3/relationships` (trading-partner pairings; receiver = supplier)                                                                                                                                                              |

## Unsupported Resources

- **Products** — Orderful has no product catalog. Item identifiers are embedded inside EDI transaction messages (e.g. `buyerItemNumber`, `vendorItemNumber`, `gtin`); there is no `/products` endpoint in the Orderful API.
- **Locations** — Orderful has no warehouse or location registry endpoint. Location identifiers appear inline in 846 inventory-advice lines but cannot be fetched or enumerated independently.
- **StockTransfers** — not an Orderful concept. Orderful is an EDI exchange platform; physical stock-transfer records do not exist in its API.
- **StockAdjustments** — not an Orderful concept. Inventory adjustments are communicated via 846 transactions rather than a dedicated adjustment resource.

## Webhooks

Orderful uses a delivery-approval pull model rather than inbound HMAC-signed webhooks. No webhook verification is implemented.
