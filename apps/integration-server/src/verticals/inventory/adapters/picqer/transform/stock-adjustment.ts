import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {strMap, toIso} from './shared'

/**
 * Raw stock history object from GET /stockhistory or GET /stockhistory/{idproduct_stock_history}.
 *
 * Field reference: https://picqer.com/en/api/stockhistory
 * change_type values: api, import, manual, picking, receipt, returned, stockcount, and others.
 */
export interface RawPicqerStockHistory {
  idproduct_stock_history: number
  idproduct: number
  idwarehouse?: number
  idlocation?: number
  iduser?: number
  old_stock?: number
  stock_change: number
  new_stock?: number
  reason?: string
  change_type?: string
  changed_at?: string
  [key: string]: unknown
}

function mapReason(changeType: string | undefined, reason: string | undefined): StockAdjustmentReason {
  const ct = (changeType ?? '').toLowerCase()
  const r = (reason ?? '').toLowerCase()
  if (ct === 'stockcount') return 'cycle_count'
  if (ct === 'manual' || r.includes('correct')) return 'correction'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('count')) return 'cycle_count'
  return 'other'
}

export function transformStockAdjustment(raw: RawPicqerStockHistory): StockAdjustment {
  const idStr = String(raw.idproduct_stock_history)
  return {
    id: idStr,
    externalId: idStr,
    locationId: raw.idwarehouse ? String(raw.idwarehouse) : '',
    reason: mapReason(raw.change_type, raw.reason),
    lines: [{
      productId: String(raw.idproduct),
      deltaQuantity: raw.stock_change,
      countedQuantity: raw.new_stock,
    }],
    adjustedAt: toIso(raw.changed_at) ?? new Date(0).toISOString(),
    platform: 'picqer',
    metadata: strMap({
      change_type: raw.change_type,
      reason: raw.reason,
      old_stock: raw.old_stock,
      new_stock: raw.new_stock,
      idlocation: raw.idlocation,
      iduser: raw.iduser,
    }),
    raw,
  }
}
