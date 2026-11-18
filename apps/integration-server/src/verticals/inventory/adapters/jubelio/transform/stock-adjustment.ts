/**
 * Jubelio stock-adjustment transform.
 *
 * GET /inventory/adjustments/      → {data: RawJubelioStockAdjustment[], count: number}
 * GET /inventory/adjustments/{id}  → RawJubelioStockAdjustment
 *
 * Field names sourced from Jubelio adjustment API.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawJubelioStockAdjustment {
  adjustment_id: number | string
  location_id?: number | string
  location_name?: string
  reason?: string
  notes?: string
  status?: string
  adjustment_date?: string
  created_by?: string
  items?: Array<{
    item_id: number | string
    qty_difference?: number | string
    qty_counted?: number | string
    notes?: string
  }>
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('opname')) return 'cycle_count'
  if (r.includes('damage') || r.includes('rusak')) return 'damage'
  if (r.includes('theft') || r.includes('steal') || r.includes('hilang')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir') || r.includes('kadaluarsa')) return 'expiration'
  if (r.includes('correct') || r.includes('koreksi')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawJubelioStockAdjustment): StockAdjustment {
  const id = String(raw.adjustment_id)
  return {
    id,
    externalId: id,
    locationId: raw.location_id != null ? String(raw.location_id) : '',
    reason: mapReason(raw.reason),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.item_id),
      deltaQuantity: pickNum(l.qty_difference) ?? 0,
      countedQuantity: pickNum(l.qty_counted),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustment_date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.created_by),
    platform: 'jubelio',
    metadata: strMap({ rawReason: raw.reason, status: raw.status, locationName: raw.location_name }),
    raw,
  }
}
