/**
 * Manhattan Active WM — inventory adjustment transform.
 *
 * WM REST endpoint:
 *   GET /wm/v1/inventory-adjustments
 *   GET /wm/v1/inventory-adjustments/{adjustmentId}
 *
 * Adjustments capture quantity corrections, cycle counts, damage write-offs,
 * and other stock reconciliation events inside the WM system.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawManhattanActiveAdjustment {
  adjustmentId: string
  locationId?: string
  locationName?: string
  /** Human-readable reason code or description. */
  reasonCode?: string
  reasonDescription?: string
  status?: string
  lines?: Array<{
    itemId: string
    /** Net quantity change (positive = increase, negative = decrease). */
    adjustmentQuantity: number
    countedQuantity?: number
    notes?: string
  }>
  adjustmentDateTime?: string
  createdByUser?: string
  [key: string]: unknown
}

function mapReason(code: string | undefined, desc: string | undefined): StockAdjustmentReason {
  const text = ((code ?? '') + ' ' + (desc ?? '')).toLowerCase()
  if (text.includes('count') || text.includes('cycle')) return 'cycle_count'
  if (text.includes('damage') || text.includes('dmg')) return 'damage'
  if (text.includes('theft') || text.includes('steal')) return 'theft'
  if (text.includes('lost') || text.includes('missing')) return 'lost'
  if (text.includes('found')) return 'found'
  if (text.includes('expir')) return 'expiration'
  if (text.includes('correct') || text.includes('adj')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawManhattanActiveAdjustment): StockAdjustment {
  return {
    id: raw.adjustmentId,
    externalId: raw.adjustmentId,
    locationId: pickStr(raw.locationId) ?? '',
    reason: mapReason(raw.reasonCode, raw.reasonDescription),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId,
      deltaQuantity: l.adjustmentQuantity,
      countedQuantity: l.countedQuantity,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustmentDateTime) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.createdByUser),
    platform: 'manhattan-active',
    metadata: strMap({
      locationName: raw.locationName,
      reasonCode: raw.reasonCode,
      reasonDescription: raw.reasonDescription,
      status: raw.status,
    }),
    raw,
  }
}
