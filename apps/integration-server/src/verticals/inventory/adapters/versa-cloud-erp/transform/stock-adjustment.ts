/**
 * Versa Cloud ERP — stock adjustment transform.
 *
 * API endpoint: GET /adjustment.json
 * Key response fields:
 *   id, location_id, reason, status, adjusted_by (user_name),
 *   adjustment_date,
 *   adjustment_lines: [{ item_id, delta_quantity, counted_quantity, notes }]
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawVersaAdjustmentLine {
  item_id: string | number
  delta_quantity?: number | string
  quantity_delta?: number | string
  counted_quantity?: number | string
  notes?: string
  [key: string]: unknown
}

export interface RawVersaStockAdjustment {
  id: string | number
  location_id?: string | number
  reason?: string
  status?: string
  user_name?: string
  adjusted_by?: string
  adjustment_date?: string
  date?: string
  adjustment_lines?: RawVersaAdjustmentLine[]
  lines?: RawVersaAdjustmentLine[]
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

export function transformStockAdjustment(raw: RawVersaStockAdjustment): StockAdjustment {
  const id = String(raw.id)
  const lines = raw.adjustment_lines ?? raw.lines ?? []

  return {
    id,
    externalId: id,
    locationId: raw.location_id != null ? String(raw.location_id) : '',
    reason: mapReason(raw.reason),
    lines: lines.map((l) => ({
      productId: String(l.item_id),
      deltaQuantity: Number(l.delta_quantity ?? l.quantity_delta ?? 0),
      countedQuantity:
        l.counted_quantity !== undefined ? Number(l.counted_quantity) : undefined,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustment_date ?? raw.date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by ?? raw.user_name),
    platform: 'versa-cloud-erp',
    metadata: strMap({ rawReason: raw.reason, status: raw.status }),
    raw,
  }
}
