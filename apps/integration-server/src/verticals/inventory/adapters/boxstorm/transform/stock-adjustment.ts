/**
 * Transform Boxstorm cycle-count / inventory-adjustment record → canonical StockAdjustment.
 *
 * NOTE: The Boxstorm (Fishbowl Advanced cloud) REST API does not expose a
 * list endpoint for inventory adjustments.  The /api/inventory/adjust endpoint
 * is write-only (POST).  This transform is provided for completeness and
 * forward-compatibility; it is NOT wired into listStockAdjustments /
 * getStockAdjustment in index.ts because there is no source endpoint to call.
 *
 * If Boxstorm adds a read endpoint in a future API revision, wire it in
 * index.ts and remove this notice.
 *
 * Field names follow the Fishbowl Advanced REST API camelCase convention
 * (consistent with the existing parts / vendors / purchase-orders transforms).
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawBoxstormAdjustmentLine {
  /** Part identifier (integer or string). */
  partId?: number | string
  /** Part number string (alternative identifier). */
  partNumber?: string
  /** Quantity change: positive = add, negative = remove. */
  quantityChange?: number
  /** Quantity after adjustment (cycle-count value). */
  quantity?: number
  notes?: string
  [key: string]: unknown
}

export interface RawBoxstormStockAdjustment {
  /** Numeric primary key. */
  id: number | string
  /** Location / location-group name or id. */
  locationId?: number | string
  locationName?: string
  /** Human-readable reason string (e.g. "Cycle Count", "Damage", "Theft"). */
  reason?: string
  /** ISO-8601 timestamp when the adjustment was recorded. */
  dateCreated?: string
  /** Username or display name of the operator. */
  createdBy?: string
  lines?: RawBoxstormAdjustmentLine[]
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

export function transformStockAdjustment(raw: RawBoxstormStockAdjustment): StockAdjustment {
  const id = String(raw.id)
  const locationId =
    raw.locationId != null
      ? String(raw.locationId)
      : pickStr(raw.locationName) ?? ''

  return {
    id,
    externalId: id,
    locationId,
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.partId != null ? String(l.partId) : pickStr(l.partNumber) ?? '',
      deltaQuantity: l.quantityChange ?? 0,
      countedQuantity: l.quantity,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.dateCreated) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.createdBy),
    platform: 'boxstorm',
    metadata: strMap({ rawReason: raw.reason }),
    raw,
  }
}
