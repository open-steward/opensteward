/**
 * Transform Crunchtime Inventory Adjustment → canonical StockAdjustment.
 *
 * Source: GET /inventory/v1/getAllInventoryAdjustments
 *         GET /inventory/v1/getInventoryAdjustmentsByPage
 *
 * Key Crunchtime field names:
 *   adjustmentId, locationCode, adjustmentDate, adjustmentReason,
 *   adjustmentUser, status,
 *   adjustmentLines[].productNumber, .adjustmentQuantity, .countedQuantity, .notes
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawCrunchtimeAdjustmentLine {
  productNumber: string
  adjustmentQuantity?: number
  countedQuantity?: number
  notes?: string
  [key: string]: unknown
}

export interface RawCrunchtimeInventoryAdjustment {
  adjustmentId: string
  locationCode?: string
  adjustmentDate?: string
  adjustmentReason?: string
  adjustmentUser?: string
  status?: string
  adjustmentLines?: RawCrunchtimeAdjustmentLine[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('physical')) return 'cycle_count'
  if (r.includes('damage') || r.includes('spoil')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('miss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir') || r.includes('waste')) return 'expiration'
  if (r.includes('correct') || r.includes('adjust')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawCrunchtimeInventoryAdjustment): StockAdjustment {
  return {
    id: raw.adjustmentId,
    externalId: raw.adjustmentId,
    locationId: raw.locationCode ?? '',
    reason: mapReason(raw.adjustmentReason),
    lines: (raw.adjustmentLines ?? []).map((l) => ({
      productId: l.productNumber,
      deltaQuantity: l.adjustmentQuantity ?? 0,
      countedQuantity: l.countedQuantity,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustmentUser),
    platform: 'crunchtime',
    metadata: strMap({
      rawReason: raw.adjustmentReason,
      status: raw.status,
    }),
    raw,
  }
}
