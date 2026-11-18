import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw stock-adjustment record from GET /api/v1/adjustments (PULPO WMS).
 */
export interface RawPulpoWmsStockAdjustment {
  id: string
  warehouse_id?: string
  reason?: string
  reason_code?: string
  status?: string
  lines?: Array<{
    product_id: string
    delta_quantity: number
    counted_quantity?: number
    notes?: string
  }>
  adjusted_at?: string
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

export function transformStockAdjustment(raw: RawPulpoWmsStockAdjustment): StockAdjustment {
  return {
    id: raw.id,
    externalId: raw.id,
    locationId: raw.warehouse_id ?? '',
    reason: mapReason(raw.reason ?? raw.reason_code),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.product_id,
      deltaQuantity: l.delta_quantity,
      countedQuantity: l.counted_quantity,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjusted_at) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by),
    platform: 'pulpo-wms',
    metadata: strMap({
      reason_code: raw.reason_code,
      status: raw.status,
    }),
    raw,
  }
}
