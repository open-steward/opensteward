/**
 * Transform E2open inventory adjustment records into canonical StockAdjustment.
 *
 * E2open does not expose a dedicated stock-adjustment API in its public CDM
 * surface. Adjustments are inferred from inventory delta transactions where
 * the transaction type indicates a non-movement quantity change (cycle count,
 * write-off, etc.).
 *
 * Fields from CDM Inventory adjustment / write-off transactions:
 *   adjustmentId        — e2open record ID
 *   locationId          — warehouse/location identifier
 *   adjustmentReason    — reason code string (e.g. "CycleCount", "Damage")
 *   adjustmentType      — transaction type (e.g. "WRITEOFF", "CORRECTION")
 *   status              — "POSTED" / "DRAFT" etc.
 *   lines[]
 *     itemId / partnerSkuCode — product identifier
 *     deltaQty            — signed quantity change (+/-)
 *     countedQty          — physical count quantity (if cycle count)
 *     notes               — free-text notes
 *   adjustmentDate      — ISO date of adjustment
 *   adjustedBy          — user or system that applied the adjustment
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawE2openStockAdjustmentLine {
  itemId?: string
  partnerSkuCode?: string
  deltaQty?: number | string
  countedQty?: number | string
  notes?: string
  [key: string]: unknown
}

export interface RawE2openStockAdjustment {
  adjustmentId?: string
  locationId?: string
  adjustmentReason?: string
  adjustmentType?: string
  status?: string
  lines?: RawE2openStockAdjustmentLine[]
  adjustmentDate?: string
  adjustedBy?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cyclecount')) return 'cycle_count'
  if (r.includes('damage'))                             return 'damage'
  if (r.includes('theft') || r.includes('steal'))      return 'theft'
  if (r.includes('lost'))                               return 'lost'
  if (r.includes('found'))                              return 'found'
  if (r.includes('expir'))                              return 'expiration'
  if (r.includes('correct') || r.includes('writeoff') || r.includes('write-off')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawE2openStockAdjustment): StockAdjustment {
  const id = pickStr(raw.adjustmentId) ?? ''

  return {
    id,
    externalId: id,
    locationId: pickStr(raw.locationId) ?? '',
    reason:     mapReason(raw.adjustmentReason ?? raw.adjustmentType),
    lines: (raw.lines ?? []).map((l) => ({
      productId:       pickStr(l.itemId) ?? pickStr(l.partnerSkuCode) ?? '',
      deltaQuantity:   pickNum(l.deltaQty) ?? 0,
      countedQuantity: pickNum(l.countedQty),
      notes:           l.notes,
    })),
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform:   'e2open',
    metadata:   strMap({
      rawReason:      raw.adjustmentReason,
      adjustmentType: raw.adjustmentType,
      status:         raw.status,
    }),
    raw,
  }
}
