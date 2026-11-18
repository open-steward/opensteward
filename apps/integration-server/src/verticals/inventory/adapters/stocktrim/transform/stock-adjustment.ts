/**
 * Transform StockTrim inventory-adjustment record → canonical StockAdjustment.
 *
 * NOTE: The StockTrim REST API does not expose a dedicated stock-adjustment
 * endpoint.  Inventory-count corrections are applied by POSTing updated
 * `stockOnHand` values to /api/Products — no discrete adjustment document is
 * created or returned.  This transform is provided for completeness and
 * forward-compatibility; it is NOT wired into listStockAdjustments /
 * getStockAdjustment in index.ts because there is no source endpoint to call.
 *
 * If StockTrim adds a read endpoint for adjustment history in a future API
 * revision, wire it in index.ts and remove this notice.
 *
 * Field names are modelled on the StockTrim Products schema
 * (https://api.stocktrim.com/index.html) extended with adjustment metadata
 * that would be expected from a future endpoint.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawStockTrimAdjustmentLine {
  /** Product identifier (productId). */
  productId: string
  /** Signed quantity change: positive = add, negative = remove. */
  deltaQuantity?: number
  /** Absolute quantity after adjustment (cycle-count value). */
  countedQuantity?: number
  notes?: string
  [key: string]: unknown
}

export interface RawStockTrimStockAdjustment {
  /** Opaque identifier for the adjustment document. */
  id: string
  /** Location code the adjustment applies to. */
  locationCode?: string
  /** Location display name. */
  locationName?: string
  /** Human-readable reason string (e.g. "Cycle Count", "Damage"). */
  reason?: string
  /** ISO-8601 timestamp when the adjustment was recorded. */
  adjustedAt?: string
  /** Username or display name of the operator. */
  adjustedBy?: string
  lines?: RawStockTrimAdjustmentLine[]
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawStockTrimStockAdjustment): StockAdjustment {
  const locationId =
    typeof raw.locationCode === 'string' && raw.locationCode
      ? raw.locationCode
      : pickStr(raw.locationName) ?? ''

  return {
    id: raw.id,
    externalId: raw.id,
    locationId,
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.productId,
      deltaQuantity: l.deltaQuantity ?? 0,
      countedQuantity: l.countedQuantity,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustedAt) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'stocktrim',
    metadata: strMap({ rawReason: raw.reason, locationName: raw.locationName }),
    raw,
  }
}
