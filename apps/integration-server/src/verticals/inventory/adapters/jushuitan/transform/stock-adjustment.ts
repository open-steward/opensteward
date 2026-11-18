/**
 * Transform a raw Jushuitan inventory count/adjustment record
 * (/open/inventory/count/query) into a canonical StockAdjustment.
 *
 * Jushuitan field reference:
 *   check_id       — numeric inventory count order ID
 *   wms_co_id      — warehouse ID
 *   type           — adjustment type/reason code (string label)
 *   status         — count order status
 *   operator       — operator/user who performed the count
 *   check_date     — date the adjustment was recorded
 *   items          — line items
 *     sku_id       — SKU numeric ID
 *     qty_check    — counted quantity
 *     qty_diff     — delta (positive or negative)
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawJushuitanStockAdjustmentItem {
  sku_id: number | string
  qty_check?: number
  qty_diff?: number
  note?: string
  [key: string]: unknown
}

export interface RawJushuitanStockAdjustment {
  check_id: number | string
  wms_co_id?: number | string
  type?: string
  status?: string | number
  operator?: string
  check_date?: string
  items?: RawJushuitanStockAdjustmentItem[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('盘')) return 'cycle_count'
  if (r.includes('damage') || r.includes('损')) return 'damage'
  if (r.includes('theft') || r.includes('盗')) return 'theft'
  if (r.includes('lost') || r.includes('丢')) return 'lost'
  if (r.includes('found') || r.includes('找')) return 'found'
  if (r.includes('expir') || r.includes('过期')) return 'expiration'
  if (r.includes('correct') || r.includes('纠')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawJushuitanStockAdjustment): StockAdjustment {
  const id = String(raw.check_id)

  return {
    id,
    externalId: id,
    locationId: raw.wms_co_id != null ? String(raw.wms_co_id) : '',
    reason: mapReason(raw.type),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.sku_id),
      deltaQuantity: l.qty_diff ?? 0,
      countedQuantity: l.qty_check,
      notes: pickStr(l.note),
    })),
    adjustedAt: toIso(raw.check_date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.operator),
    platform: 'jushuitan',
    metadata: strMap({ type: raw.type, status: raw.status }),
    raw,
  }
}
