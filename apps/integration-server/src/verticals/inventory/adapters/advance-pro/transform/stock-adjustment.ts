/**
 * AdvancePro stock adjustment transform.
 *
 * GET /api/StockAdjustments returns adjustment records.
 *
 * Known response fields:
 *   id, warehouseId, warehouseName, reason, status,
 *   adjustedDate, adjustedBy, userName,
 *   lines[]: { productId, productSku, deltaQuantity, countedQuantity, notes }
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawAdvanceProAdjustmentLine {
  productId?: string | number
  productSku?: string
  deltaQuantity?: number | string
  delta?: number | string
  countedQuantity?: number | string
  counted?: number | string
  notes?: string
  note?: string
}

export interface RawAdvanceProStockAdjustment {
  id?: string | number
  warehouseId?: string | number
  warehouseName?: string
  reason?: string
  status?: string
  adjustedDate?: string
  date?: string
  adjustedBy?: string
  userName?: string
  lines?: RawAdvanceProAdjustmentLine[]
  items?: RawAdvanceProAdjustmentLine[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('stolen')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawAdvanceProStockAdjustment): StockAdjustment {
  const externalId = String(raw.id ?? '')
  const rawLines = raw.lines ?? raw.items ?? []

  return {
    id: externalId,
    externalId,
    locationId: raw.warehouseId != null ? String(raw.warehouseId) : '',
    reason: mapReason(raw.reason),
    lines: rawLines.map((l) => ({
      productId: String(l.productId ?? ''),
      deltaQuantity: pickNum(l.deltaQuantity ?? l.delta) ?? 0,
      countedQuantity: pickNum(l.countedQuantity ?? l.counted),
      notes: pickStr(l.notes ?? l.note),
    })),
    adjustedAt: toIso(raw.adjustedDate ?? raw.date) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy ?? raw.userName),
    platform: 'advance-pro',
    metadata: strMap({
      rawReason: raw.reason,
      status: raw.status,
      warehouseName: raw.warehouseName,
    }),
    raw,
  }
}
