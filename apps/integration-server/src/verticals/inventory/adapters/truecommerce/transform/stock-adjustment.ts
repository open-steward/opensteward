/**
 * TrueCommerce stock-adjustment transform.
 *
 * Maps GET /v1/stock-adjustments response fields:
 *   adjustment_id, location_id, reason, status,
 *   line_items (item_id, delta_qty, counted_qty, notes),
 *   adjustment_date, adjusted_by
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawTruecommerceStockAdjustmentLine {
  item_id: string
  delta_qty: number
  counted_qty?: number
  notes?: string
}

export interface RawTruecommerceStockAdjustment {
  adjustment_id: string
  location_id?: string
  reason?: string
  status?: string
  line_items?: RawTruecommerceStockAdjustmentLine[]
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

export function transformStockAdjustment(raw: RawTruecommerceStockAdjustment): StockAdjustment {
  return {
    id: raw.adjustment_id,
    externalId: raw.adjustment_id,
    locationId: raw.location_id ?? '',
    reason: mapReason(raw.reason),
    lines: (raw.line_items ?? []).map((l) => ({
      productId: l.item_id,
      deltaQuantity: l.delta_qty,
      countedQuantity: l.counted_qty,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjustment_date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by),
    platform: 'truecommerce',
    metadata: strMap({ rawReason: raw.reason, status: raw.status }),
    raw,
  }
}
