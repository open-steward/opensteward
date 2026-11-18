import type { StockLevel } from '../../../schema/stock-level'
import { toIso, pickNum, strMap } from './shared'

/**
 * `InventoryLocationStockGet` → `mvProductStockList[]`.
 *
 * Shape confirmed live 2026-09-18. The response is NESTED: one entry per
 * product, each carrying an `mvStock[]` of per-location rows.
 *
 *   { productID, mvStock: [ { InventoryLocationID, StockPhysical, StockOnHold,
 *     StockNonShipped, StockNonAllocatedWOs, StockNonReceivedPOs,
 *     StockNonReceivedWOs, StockOnHand, StockAlertLevel, SubLocation,
 *     InventoryLocationStockCreationDate,
 *     InventoryLocationStockLastUpdatedDate } ] }
 *
 * A canonical StockLevel is per (product, location), so one product held at
 * three locations becomes three rows and the id has to be composite — neither
 * half identifies a row on its own.
 *
 * Note `productID` is lower-cased here while `ProductGet` returns `ProductID`.
 * That inconsistency is the service's, not a typo.
 */
export interface RawMegaventoryStock {
  InventoryLocationID?: number
  StockPhysical?: number | null
  StockOnHold?: number | null
  StockNonShipped?: number | null
  StockNonAllocatedWOs?: number | null
  StockNonReceivedPOs?: number | null
  StockNonReceivedWOs?: number | null
  StockOnHand?: number | null
  StockAlertLevel?: number | null
  SubLocation?: string | null
  InventoryLocationStockCreationDate?: string | null
  InventoryLocationStockLastUpdatedDate?: string | null
  [key: string]: unknown
}

export interface RawMegaventoryProductStock {
  productID?: number
  mvStock?: RawMegaventoryStock[] | null
  [key: string]: unknown
}

export function transformStockLevel(
  parent: RawMegaventoryProductStock,
  stock: RawMegaventoryStock,
): StockLevel {
  const productId = String(parent.productID ?? '')
  const locationId = String(stock.InventoryLocationID ?? '')
  const onHand = pickNum(stock.StockOnHand) ?? 0
  const onHold = pickNum(stock.StockOnHold) ?? 0
  return {
    id: `${productId}:${locationId}`,
    externalId: `${productId}:${locationId}`,
    productId,
    locationId,
    // StockPhysical is what is in the building; StockOnHand is the figure
    // Megaventory itself treats as the stock position, so it is the canonical
    // on-hand and StockPhysical stays on raw.
    quantityOnHand: onHand,
    // Nothing in the payload is labelled "available". On-hand minus the
    // quantity held for other commitments is the arithmetic the canonical
    // field describes, and it is derived here rather than borrowed from a
    // field that means something else.
    quantityAvailable: onHand - onHold,
    quantityCommitted: onHold,
    // Stock on a purchase order that has not been received yet.
    quantityIncoming: pickNum(stock.StockNonReceivedPOs),
    // Sold but not yet shipped — on its way out of this location.
    quantityOutgoing: pickNum(stock.StockNonShipped),
    reorderPoint: pickNum(stock.StockAlertLevel),
    // NOT mapped to lastCountedAt: InventoryLocationStockLastUpdatedDate is
    // when the RECORD changed, not when anyone physically counted the stock.
    // Equating the two would report every write as a stocktake. It is kept
    // verbatim in metadata instead.
    platform: 'megaventory',
    metadata: strMap({
      SubLocation: stock.SubLocation,
      InventoryLocationStockLastUpdatedDate: toIso(stock.InventoryLocationStockLastUpdatedDate),
      StockPhysical: stock.StockPhysical,
      StockNonAllocatedWOs: stock.StockNonAllocatedWOs,
      StockNonReceivedWOs: stock.StockNonReceivedWOs,
    }),
    raw: { productID: parent.productID, stock } as unknown as Record<string, unknown>,
  }
}

/** Flatten one product's nested stock into its per-location canonical rows. */
export function flattenStockLevels(parent: RawMegaventoryProductStock): StockLevel[] {
  return (parent.mvStock ?? [])
    .filter((s) => s.InventoryLocationID != null)
    .map((s) => transformStockLevel(parent, s))
}
