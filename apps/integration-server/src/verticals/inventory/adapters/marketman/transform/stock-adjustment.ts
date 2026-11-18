/**
 * MarketMan inventory count → canonical StockAdjustment.
 *
 * MarketMan does not have a dedicated stock-adjustment endpoint; its closest
 * equivalent is an inventory count (cycle count) from
 * POST /buyers/inventory/GetInventoryCounts.
 * Response key: "InventoryCounts"
 *
 * Each count record is modelled as a cycle-count adjustment.
 */
import type { StockAdjustment } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawMarketmanStockAdjustment {
  ID?: string | null
  BuyerName?: string | null
  BuyerGuid?: string | null
  /** Documented as CountDateUTC ("Date count was taken"). */
  CountDateUTC?: string | null
  PriceTotalWithoutVAT?: number | null
  /** Typo in MarketMan API: "Commments" */
  Commments?: string | null
  Lines?: Array<{
    LineID?: string | null
    ItemID?: string | null
    ItemName?: string | null
    TotalCount?: number | null
    TotalValue?: number | null
  }> | null
  [key: string]: unknown
}

export function transformStockAdjustment(raw: RawMarketmanStockAdjustment): StockAdjustment {
  const id = pickStr(raw.ID) ?? ''
  return {
    id,
    externalId: id,
    locationId: pickStr(raw.BuyerGuid) ?? '',
    reason: 'cycle_count',
    lines: (raw.Lines ?? []).map((l) => ({
      productId: String(l.ItemID ?? ''),
      deltaQuantity: l.TotalCount ?? 0,
      countedQuantity: l.TotalCount ?? undefined,
      notes: pickStr(l.ItemName),
    })),
    adjustedAt: toIso(raw.CountDateUTC) ?? new Date(0).toISOString(),
    adjustedBy: undefined,
    platform: 'marketman',
    metadata: strMap({
      buyerName: raw.BuyerName,
      priceTotalWithoutVAT: raw.PriceTotalWithoutVAT,
      comments: raw.Commments,
    }),
    raw,
  }
}
