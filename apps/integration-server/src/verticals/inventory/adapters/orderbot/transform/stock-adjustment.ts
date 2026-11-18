/**
 * Orderbot stock-adjustment transform.
 *
 * Stock adjustments in Orderbot represent on-hand quantity corrections
 * posted through the system (cycle counts, damage write-offs, etc.).
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOrderbotStockAdjustmentLine {
  product_id?: string | number
  sku?: string
  delta_quantity?: number | string
  quantity_delta?: number | string
  counted_quantity?: number | string
  notes?: string
  [key: string]: unknown
}

export interface RawOrderbotStockAdjustment {
  id?: string | number
  location_id?: string | number
  distribution_center_id?: string | number
  reason?: string
  reason_code?: string
  status?: string
  lines?: RawOrderbotStockAdjustmentLine[]
  line_items?: RawOrderbotStockAdjustmentLine[]
  adjusted_at?: string
  date?: string
  created_at?: string
  adjusted_by?: string
  user_name?: string
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

export function transformStockAdjustment(raw: RawOrderbotStockAdjustment): StockAdjustment {
  const id = String(raw.id ?? '')
  const locationId = String(
    raw.location_id ?? raw.distribution_center_id ?? ''
  )
  const rawLines = raw.lines ?? raw.line_items ?? []
  const reason = pickStr(raw.reason) ?? pickStr(raw.reason_code)
  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(reason),
    lines: rawLines.map((l) => ({
      productId: String(l.product_id ?? l.sku ?? ''),
      deltaQuantity: pickNum(l.delta_quantity) ?? pickNum(l.quantity_delta) ?? 0,
      countedQuantity: pickNum(l.counted_quantity),
      notes: pickStr(l.notes),
    })),
    adjustedAt:
      toIso(raw.adjusted_at) ??
      toIso(raw.date) ??
      toIso(raw.created_at) ??
      new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by) ?? pickStr(raw.user_name),
    platform: 'orderbot',
    metadata: strMap({ rawReason: reason, status: raw.status }),
    raw,
  }
}
