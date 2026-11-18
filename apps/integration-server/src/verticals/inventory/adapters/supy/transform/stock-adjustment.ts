/**
 * Supy "stock take" / "wastage" → canonical StockAdjustment transform.
 *
 * Supy exposes two adjustment types: periodic stock takes (full counts) and
 * wastage records. Both are modelled as StockAdjustment. The reason field is
 * inferred from the `type` property (stocktake → cycle_count, wastage →
 * damage/expiration, correction → correction).
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSupyAdjustmentLine {
  itemId: string
  deltaQuantity: number
  countedQuantity?: number
  expectedQuantity?: number
  notes?: string
  [key: string]: unknown
}

export interface RawSupyStockAdjustment {
  id: string
  branchId?: string
  type?: string
  reason?: string
  status?: string
  lines?: RawSupyAdjustmentLine[]
  adjustedAt?: string
  createdAt?: string
  adjustedBy?: string
  [key: string]: unknown
}

function mapReason(type: string | undefined, reason: string | undefined): StockAdjustmentReason {
  const t = (type ?? '').toLowerCase()
  const r = (reason ?? '').toLowerCase()
  if (t === 'stocktake' || t === 'stock_take' || t === 'count') return 'cycle_count'
  if (t === 'wastage' || r.includes('waste')) {
    if (r.includes('expir') || r.includes('spoil')) return 'expiration'
    if (r.includes('damage') || r.includes('break')) return 'damage'
    return 'damage'
  }
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSupyStockAdjustment): StockAdjustment {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    locationId: pickStr(raw.branchId) ?? '',
    reason: mapReason(raw.type, raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      deltaQuantity: l.deltaQuantity,
      countedQuantity: l.countedQuantity,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustedAt ?? raw.createdAt) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'supy',
    metadata: strMap({
      type: raw.type,
      rawReason: raw.reason,
      status: raw.status,
    }),
    raw,
  }
}
