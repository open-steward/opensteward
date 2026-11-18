/**
 * Megaventory API v2017a.
 *
 * Every operation name and response key below was read from the LIVE service's
 * own ServiceStack metadata on 2026-09-18 — not from documentation, because
 * there effectively is none: megaventory.com/developers points at
 * api.megaventory.com, and that page renders no content to a fetch. The
 * service itself is the authority:
 *
 *   index    https://api.megaventory.com/v2017a/metadata          (112 operations)
 *   per-op   https://api.megaventory.com/v2017a/json/metadata?op=ProductGet
 *
 * Before this, the adapter sent Cin7 Core's paths — productList,
 * ref/stockonhand, supplierList, purchaseList, stockAdjustmentList,
 * stockTransferList — to Megaventory's host, and authenticated with a Bearer
 * header Megaventory does not read. It was a byte-copy of the Cin7 reference
 * adapter wearing Megaventory's base URL.
 */
export const API_BASE_URL = 'https://api.megaventory.com/v2017a/json/reply'

/**
 * Operations, with the response key each returns.
 *
 * A Megaventory response is a single named array plus a `ResponseStatus`; the
 * key differs per operation and is not derivable from the operation name
 * (`InventoryLocationStockGet` answers with `mvProductStockList`), so both
 * halves are pinned here together.
 */
export const OPERATIONS = {
  product: { op: 'ProductGet', key: 'mvProducts' },
  location: { op: 'InventoryLocationGet', key: 'mvInventoryLocations' },
  stockLevel: { op: 'InventoryLocationStockGet', key: 'mvProductStockList' },
  purchaseOrder: { op: 'PurchaseOrderGet', key: 'mvPurchaseOrders' },
  supplier: { op: 'SupplierClientGet', key: 'mvSupplierClients' },
} as const

/**
 * `ReturnTopNRecords` is a TOP-N LIMITER, not a page size — the service orders
 * by `<Entity>ID` descending and returns the first N. None of the five Get
 * operations in `OPERATIONS` takes an offset, page or cursor. (Megaventory
 * does page some other operations: BatchNumberGet and SerialNumberGet take a
 * 1-based `Page` and a `Limit`.)
 *
 * Forwarding a page size as though it paged returns the same newest rows on
 * every call while reporting progress, so every list sends `-1` ("all
 * records") and slices the caller's page locally.
 */
export const RETURN_ALL_RECORDS = -1

/** `SupplierClientGet` returns customers too; this is the half we want. */
export const SUPPLIER_CLIENT_TYPE = 'Supplier'
