import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * EasyEcom stock adjustment record.
 * Fields sourced from EasyEcom API /inventory/getStockAdjustments response.
 */
export interface RawEasyEcomStockAdjustment {
  adjustment_id: string | number
  warehouse_id?: string | number
  reason?: string
  status?: string
  items?: Array<{
    sku?: string
    product_id?: string | number
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
  if (r.includes('count') || r.includes('audit')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('missing')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawEasyEcomStockAdjustment): StockAdjustment {
  const id = String(raw.adjustment_id)
  return {
    id,
    externalId: id,
    locationId: raw.warehouse_id != null ? String(raw.warehouse_id) : '',
    reason: mapReason(raw.reason),
    lines: (raw.items ?? []).map((l) => ({
      productId: l.product_id != null ? String(l.product_id) : (l.sku ?? ''),
      deltaQuantity: pickNum(l.adjusted_qty) ?? 0,
      countedQuantity: pickNum(l.counted_qty),
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjustment_date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjusted_by),
    platform: 'easyecom',
    metadata: strMap({ rawReason: raw.reason, status: raw.status }),
    raw,
  }
}
