/**
 * Transform Infor WMS inventory adjustment records.
 *
 * Infor WMS quantity adjustments are available at /WMS/adjustments.
 * These represent cycle counts, damage writeoffs, found/lost, expiry removals,
 * and manual corrections. Key fields:
 *   adjustmentId    — internal WMS adjustment identifier
 *   warehouseId     — warehouse where adjustment occurred
 *   adjustmentType  — CYCLE_COUNT | DAMAGE | LOST | FOUND | EXPIRY | CORRECTION | OTHER
 *   adjustmentDate  — date the adjustment was posted
 *   adjustedBy      — user who performed the adjustment
 *   status          — PENDING | POSTED | CANCELLED
 *   lines           — individual item adjustments
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawInforWmsAdjustmentLine {
  lineNumber?: number | string
  itemNumber: string
  adjustmentQty?: number | string
  countedQty?: number | string
  notes?: string
  lotNumber?: string
  [key: string]: unknown
}

export interface RawInforWmsAdjustment {
  adjustmentId: string
  warehouseId?: string
  adjustmentType?: string
  adjustmentDate?: string
  adjustedBy?: string
  status?: string
  ownerCode?: string
  lines?: RawInforWmsAdjustmentLine[]
  [key: string]: unknown
}

function mapReason(t: string | undefined): StockAdjustmentReason {
  const s = (t ?? '').toUpperCase()
  if (s.includes('CYCLE') || s.includes('COUNT')) return 'cycle_count'
  if (s.includes('DAMAGE') || s.includes('DAMAGED')) return 'damage'
  if (s.includes('THEFT') || s.includes('STOLEN')) return 'theft'
  if (s.includes('LOST')) return 'lost'
  if (s.includes('FOUND')) return 'found'
  if (s.includes('EXPIR') || s.includes('EXPIRED')) return 'expiration'
  if (s.includes('CORRECT') || s.includes('ADJUSTMENT') || s.includes('MANUAL')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawInforWmsAdjustment): StockAdjustment {
  return {
    id: raw.adjustmentId,
    externalId: raw.adjustmentId,
    locationId: raw.warehouseId ?? '',
    reason: mapReason(raw.adjustmentType),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemNumber,
      deltaQuantity: pickNum(l.adjustmentQty) ?? 0,
      countedQuantity: pickNum(l.countedQty),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'infor-wms',
    metadata: strMap({
      adjustmentType: raw.adjustmentType,
      status: raw.status,
      ownerCode: raw.ownerCode,
    }),
    raw,
  }
}
