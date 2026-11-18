/**
 * Transform a raw Tecsys OrderDynamics inventory-adjustment response into the
 * canonical StockAdjustment schema.
 *
 * Tecsys supports stock adjustments (cycle counts, corrections, damages, etc.)
 * via the physical inventory update flow.
 *
 * Key fields: AdjustmentId, LocationInternalName, AdjustmentReason, Status,
 *   AdjustedDate, AdjustedBy, Lines[].
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawTecsysStockAdjustment {
  /** Unique internal adjustment ID. */
  AdjustmentId: string
  /** Internal name of the location where the adjustment occurred. */
  LocationInternalName?: string
  /** Reason code or description for the adjustment. */
  AdjustmentReason?: string
  /** Adjustment status (e.g. "Pending", "Posted", "Cancelled"). */
  Status?: string
  /** ISO 8601 date/time the adjustment was recorded. */
  AdjustedDate?: string
  /** Username or identifier of the person who made the adjustment. */
  AdjustedBy?: string
  /** Line items in this adjustment. */
  Lines?: Array<{
    Sku: string
    /** Signed delta (positive = increase, negative = decrease). */
    QuantityDelta: number
    /** Counted quantity (for cycle count adjustments). */
    CountedQuantity?: number
    Notes?: string
  }>
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('stolen')) return 'theft'
  if (r.includes('lost') || r.includes('missing')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir') || r.includes('expired')) return 'expiration'
  if (r.includes('correct') || r.includes('correction')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawTecsysStockAdjustment): StockAdjustment {
  return {
    id: raw.AdjustmentId,
    externalId: raw.AdjustmentId,
    locationId: raw.LocationInternalName ?? '',
    reason: mapReason(raw.AdjustmentReason),
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.Sku,
      deltaQuantity: l.QuantityDelta,
      countedQuantity: l.CountedQuantity,
      notes: l.Notes,
    })),
    adjustedAt: toIso(raw.AdjustedDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.AdjustedBy),
    platform: 'tecsys',
    metadata: strMap({ rawReason: raw.AdjustmentReason, status: raw.Status }),
    raw,
  }
}
