import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw inventory adjustment record from the SkuNexus REST API.
 * SkuNexus uses "inventory adjustments" for ad-hoc stock corrections.
 * Endpoint: GET /api/v1/inventory_adjustments  (list)
 *           GET /api/v1/inventory_adjustments/:id (single)
 */
export interface RawSkuNexusStockAdjustment {
  id: string | number
  location_id?: string | number | null
  warehouse_id?: string | number | null
  reason?: string
  reason_code?: string
  status?: string
  line_items?: Array<{
    id?: string | number
    product_id: string | number
    quantity_delta?: number | string
    quantity_adjusted?: number | string
    counted_quantity?: number | string
    notes?: string
  }>
  adjusted_at?: string
  adjusted_by?: string
  user_name?: string
  created_at?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('stolen') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSkuNexusStockAdjustment): StockAdjustment {
  const id = String(raw.id)
  const locationId = String(raw.location_id ?? raw.warehouse_id ?? '')
  const reasonLabel = raw.reason ?? raw.reason_code

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(reasonLabel),
    lines: (raw.line_items ?? []).map((l) => ({
      productId: String(l.product_id),
      deltaQuantity: pickNum(l.quantity_delta ?? l.quantity_adjusted) ?? 0,
      countedQuantity: pickNum(l.counted_quantity),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjusted_at) ?? toIso(raw.created_at) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by) ?? pickStr(raw.user_name),
    platform: 'skunexus',
    metadata: strMap({ reason_code: raw.reason_code, status: raw.status }),
    raw,
  }
}
