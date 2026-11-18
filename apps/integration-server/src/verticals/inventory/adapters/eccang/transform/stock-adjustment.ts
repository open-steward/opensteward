/**
 * Transform ECCANG stock adjustment (盘点/调整单) records to the canonical StockAdjustment schema.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawEccangStockAdjustmentLine {
  goods_id?: string | number
  sku_id?: string | number
  goods_no?: string
  adjust_qty?: number | string
  actual_qty?: number | string
  remark?: string
  [key: string]: unknown
}

export interface RawEccangStockAdjustment {
  adjust_order_id?: string | number
  adjust_order_no?: string
  warehouse_id?: string | number
  warehouse_code?: string
  adjust_reason?: string
  status?: string | number
  adjust_time?: string
  operator?: string
  items?: RawEccangStockAdjustmentLine[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('盘点')) return 'cycle_count'
  if (r.includes('damage') || r.includes('损')) return 'damage'
  if (r.includes('theft') || r.includes('steal') || r.includes('盗')) return 'theft'
  if (r.includes('lost') || r.includes('丢')) return 'lost'
  if (r.includes('found') || r.includes('溢')) return 'found'
  if (r.includes('expir') || r.includes('过期')) return 'expiration'
  if (r.includes('correct') || r.includes('纠正')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawEccangStockAdjustment): StockAdjustment {
  const id = String(raw.adjust_order_id ?? '')
  return {
    id,
    externalId: id,
    locationId: raw.warehouse_id ? String(raw.warehouse_id) : pickStr(raw.warehouse_code) ?? '',
    reason: mapReason(pickStr(raw.adjust_reason)),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.sku_id ?? l.goods_id ?? ''),
      deltaQuantity: pickNum(l.adjust_qty) ?? 0,
      countedQuantity: pickNum(l.actual_qty),
      notes: pickStr(l.remark),
    })),
    adjustedAt: toIso(raw.adjust_time) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.operator),
    platform: 'eccang',
    metadata: strMap({
      adjustReason: raw.adjust_reason,
      status: raw.status,
      warehouseCode: raw.warehouse_code,
      orderNo: raw.adjust_order_no,
    }),
    raw,
  }
}
