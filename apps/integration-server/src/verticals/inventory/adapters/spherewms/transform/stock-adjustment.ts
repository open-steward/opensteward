import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw adjustment history record from GET /adjustment-history or GET /adjustment-history/{id}.
 * SphereWMS pending adjustments (GET /adjustments) share the same shape.
 * Fields sourced from SphereWMS API v2.27.0.
 */
export interface RawSphereWmsAdjustment {
  adjustment_id?: string | number
  id?: string | number
  adjustment_number?: string
  location_id?: string
  reason?: string
  reason_code?: string
  status?: string
  status_code?: string | number
  client_code?: string
  created_on?: string
  posted_on?: string
  adjusted_by?: string
  user_name?: string
  items?: Array<{
    product_id?: string | number
    product_code?: string
    quantity?: number
    delta_qty?: number
    counted_qty?: number
    notes?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

function mapReason(reason: string | undefined, reasonCode: string | undefined): StockAdjustmentReason {
  const r = (reason ?? reasonCode ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('dmg')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSphereWmsAdjustment): StockAdjustment {
  const id = String(raw.adjustment_id ?? raw.id ?? '')
  return {
    id,
    externalId: id,
    locationId: raw.location_id ?? '',
    reason: mapReason(raw.reason, raw.reason_code),
    lines: (raw.items ?? []).map((item) => ({
      productId: String(item.product_id ?? item.product_code ?? ''),
      deltaQuantity: item.delta_qty ?? item.quantity ?? 0,
      countedQuantity: item.counted_qty,
      notes: item.notes,
    })),
    adjustedAt: toIso(raw.posted_on ?? raw.created_on) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by ?? raw.user_name),
    platform: 'spherewms',
    metadata: strMap({
      clientCode: raw.client_code,
      adjustmentNumber: raw.adjustment_number,
      rawReason: raw.reason,
      reasonCode: raw.reason_code,
      status: raw.status,
    }),
    raw,
  }
}
