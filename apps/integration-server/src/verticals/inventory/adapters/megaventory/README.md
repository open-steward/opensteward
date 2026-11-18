# Megaventory inventory adapter

Greek/US mid-market inventory + light manufacturing, against
`https://api.megaventory.com/v2017a/json/reply`.

Auth: a Megaventory API key (Settings → My Profile → create API key), entered
via `credentialFields()` and sent as `APIKEY` **in the request body**.
Megaventory reads no `Authorization` header.

## Where the contract came from

Megaventory publishes no readable API documentation — `megaventory.com/developers`
points at `api.megaventory.com`, and that page renders nothing to a fetch. The
live service describes itself instead, and that is what this adapter was built
against (2026-09-18):

- `https://api.megaventory.com/v2017a/metadata` — all 112 operations
- `https://api.megaventory.com/v2017a/json/metadata?op=ProductGet` — per-operation
  request and response DTOs, with worked examples

## Resources

| Canonical resource | Operation | Response key |
|---|---|---|
| products | `ProductGet` | `mvProducts` |
| stock levels | `InventoryLocationStockGet` | `mvProductStockList` |
| locations | `InventoryLocationGet` | `mvInventoryLocations` |
| suppliers | `SupplierClientGet` | `mvSupplierClients` |
| purchase orders | `PurchaseOrderGet` | `mvPurchaseOrders` |

The response key is not derivable from the operation name, so
`constants.ts` pins both halves together.

## Four traps this API sets

1. **Errors are in-band on HTTP 200.** A missing or invalid key answers `200`
   with an empty array and `ResponseStatus.ErrorCode: "500"`. A client that
   only checks the HTTP status reports a successful sync of zero rows. The
   client raises `MegaventoryError` instead.
2. **The five list operations do not paginate.** `ReturnTopNRecords` is a
   top-N limiter ordered by `<Entity>ID` descending, and none of the five
   operations above takes an offset, page or cursor. (Some other operations
   do: `BatchNumberGet` and `SerialNumberGet` take a 1-based `Page` and a
   `Limit`.) Sending the caller's `limit` as `ReturnTopNRecords` returned the
   same newest rows for every page, so every list asks for all records (`-1`)
   and slices the caller's page locally, reporting the exact total. Stock
   levels are sliced after flattening, because the response nests one entry
   per product, and in a fixed order (product id descending, then location id
   ascending), because the order of one product's locations is not documented.
3. **Dates are .NET**, `/Date(1530110485503-0000)/`, and an unset date is
   `DateTime.MinValue` (`/Date(-62135596800000-0000)/`) rather than null.
   Parsing these as ISO loses every timestamp; parsing the sentinel literally
   publishes dates in the year 1.
4. **Suppliers and customers share one operation.** `SupplierClientGet` returns
   both, discriminated by `SupplierClientType`. The adapter filters to
   `Supplier`; without that filter a sync imports the account's whole customer
   list as suppliers.

## Not implemented

- **stock transfers** and **stock adjustments** — no such operation exists.
  `TransferGet`, `StockTransferGet`, `InventoryLocationTransferGet`,
  `StockAdjustmentGet`, `AdjustmentGet` and
  `InventoryLocationStockAdjustmentGet` were each probed against the live
  service and none resolves to a route; none appears in the 112-operation
  index either. Megaventory records stock movement as Documents
  (`DocumentGet`), a document feed rather than adjustment records.
- **webhooks** — `EventSubscriptionAdd` exchanges no signing secret, so a
  callback cannot be authenticated. The verifier fails closed.

## Deliberately unmapped

- `ProductWeight` / `ProductLength|Breadth|Height` carry no unit (it is
  account-level, via a separate `WeightUnitGet` operation), and the canonical
  fields are fixed to grams and centimetres.
- `ProductSellingPrice` / `ProductPurchasePrice` carry no currency, and
  canonical `Money` requires an ISO 4217 code.
- `ProductCategoryID` is an id, not a name.
- `InventoryLocationAddress` is one free-text string, not a structured address.

All four survive on `raw` and in `metadata`.

## Refused
- Product images / file URLs
- Supplier banking details / payment terms
- BOM / kit components / work orders
- Customer-facing order data
