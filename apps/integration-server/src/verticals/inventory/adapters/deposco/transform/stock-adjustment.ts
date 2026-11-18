/**
 * Transform a Deposco WMS inventory adjustment record into the canonical StockAdjustment shape.
 *
 * Endpoint: GET /adjustments  or  GET /adjustments/{adjustmentNumber}
 *
 * Field notes:
 *   adjustmentNumber      — primary key
 *   facilityNumber        — warehouse where adjustment occurred
 *   reason                — reason code string (CYCLE COUNT, DAMAGE, CORRECTION, etc.)
 *   status                — OPEN | POSTED | CANCELLED
 *   lines[].itemNumber    — product SKU
 *   lines[].quantityAdjusted — signed quantity delta (+/-)
 *   lines[].quantityCounted  — physical count qty (for cycle counts)
 *   lines[].notes         — line-level notes
 *   adjustmentDate        — ISO date of adjustment
 *   createdBy             — username who created the adjustment
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawDeposcoAdjustment {
  adjustmentNumber: string
  facilityNumber?: string
  reason?: string
  status?: string
  lines?: Array<{
    itemNumber: string
    quantityAdjusted: number | string
    quantityCounted?: number | string
    notes?: string
  }>
  adjustmentDate?: string
  createdBy?: string
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

export function transformStockAdjustment(raw: RawDeposcoAdjustment): StockAdjustment {
  return {
    id: raw.adjustmentNumber,
    externalId: raw.adjustmentNumber,
    locationId: raw.facilityNumber ?? '',
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemNumber,
      deltaQuantity: pickNum(l.quantityAdjusted) ?? 0,
      countedQuantity: pickNum(l.quantityCounted),
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.createdBy),
    platform: 'deposco',
    metadata: strMap({ rawReason: raw.reason, status: raw.status }),
    raw,
  }
}
