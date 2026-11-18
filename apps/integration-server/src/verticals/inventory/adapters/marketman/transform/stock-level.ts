/**
 * MarketMan inventory count line → canonical StockLevel.
 *
 * MarketMan exposes inventory counts via POST /buyers/inventory/GetInventoryCounts.
 * Response key: "InventoryCounts" → each count has a "Lines" array.
 *
 * Each line represents one item's quantity at the time of the count.
 * We derive a synthetic stock-level from the most-recent count line.
 */
import type { StockLevel } from '../../../schema/stock-level'
import {pickStr, strMap, toIso} from './shared'

export interface RawMarketmanStockLevelLine {
  /** Count record ID */
  CountID?: string
  /** Item ID */
  ItemID?: string | null
  /** Item name */
  ItemName?: string | null
  /** Total quantity counted */
  TotalCount?: number | null
  /** Total value of counted stock */
  TotalValue?: number | null
  /** Buyer GUID this line belongs to */
  BuyerGuid?: string
  /** Date of the count (UTC) */
  CountDateUTC?: string | null
  [key: string]: unknown
}

export function transformStockLevel(raw: RawMarketmanStockLevelLine): StockLevel {
  const productId = String(raw.ItemID ?? '')
  const locationId = pickStr(raw.BuyerGuid) ?? ''
  // Residual risk: the docs neither confirm nor rule out that an ItemID is
  // unique within one count. GetInventoryCounts' LineDetail table lists
  // `LineID` and `ParentItemID` with empty descriptions, and each count in
  // its example holds a single line, so it cannot show either way. If one
  // count ever holds two lines for an item, they share this id.
  const id = `${productId}:${locationId}:${raw.CountID ?? ''}`
  return {
    id,
    productId,
    locationId,
    quantityOnHand: raw.TotalCount ?? 0,
    quantityAvailable: undefined,
    quantityCommitted: undefined,
    quantityIncoming: undefined,
    reorderPoint: undefined,
    reorderQuantity: undefined,
    lastCountedAt: toIso(raw.CountDateUTC),
    platform: 'marketman',
    metadata: strMap({
      countId: raw.CountID,
      itemName: raw.ItemName,
      totalValue: raw.TotalValue,
    }),
    raw,
  }
}
