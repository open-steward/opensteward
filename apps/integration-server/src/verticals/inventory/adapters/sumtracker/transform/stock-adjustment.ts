import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Sumtracker stock adjustment object as returned by GET /stock_adjustments
 * or GET /stock_adjustments/:id.
 */
export interface RawSumtrackerStockAdjustment {
  id: string | number
  warehouse_id?: string | number
  reason?: string
  status?: string
  items?: Array<{
    product_id: string | number
    adjusted_qty?: number | string
    counted_qty?: number | string
    notes?: string
  }>
  adjustment_date?: string
  adjusted_by?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSumtrackerStockAdjustment): StockAdjustment {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    locationId: raw.warehouse_id !== undefined ? String(raw.warehouse_id) : '',
    reason: mapReason(raw.reason),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.product_id),
      deltaQuantity: pickNum(l.adjusted_qty) ?? 0,
      countedQuantity: pickNum(l.counted_qty),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustment_date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by),
    platform: 'sumtracker',
    metadata: strMap({ reason: raw.reason, status: raw.status }),
    raw,
  }
}
