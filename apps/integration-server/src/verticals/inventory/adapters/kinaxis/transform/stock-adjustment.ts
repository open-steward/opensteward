/**
 * Kinaxis Maestro InventoryAdjustment → StockAdjustment transform.
 *
 * Maestro exposes manual inventory corrections via the InventoryAdjustment table.
 * Key fields:
 *   id           — system UUID
 *   siteId       — site where the adjustment occurred (references Site.id)
 *   reason       — free-text reason code (e.g. "CycleCount", "Damage", "WriteOff")
 *   status       — "Draft" | "Posted" | "Cancelled"
 *   lines        — array of InventoryAdjustmentLine
 *     partId     — references Part.id
 *     deltaQty   — signed quantity delta (positive = increase, negative = decrease)
 *     countedQty — physical count quantity (from cycle count; may be null)
 *     notes      — optional line-level note
 *   adjustmentDate — ISO-8601 date/time of adjustment
 *   adjustedBy     — username or user ID
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawKinaxisInventoryAdjustment {
  id: string
  siteId?: string
  reason?: string
  status?: string
  lines?: Array<{
    partId: string
    deltaQty: number
    countedQty?: number
    notes?: string
  }>
  adjustmentDate?: string
  adjustedBy?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cyclecount')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('writeoff') || r.includes('write-off')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawKinaxisInventoryAdjustment): StockAdjustment {
  return {
    id: raw.id,
    externalId: raw.id,
    locationId: raw.siteId ?? '',
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.partId,
      deltaQuantity: l.deltaQty,
      countedQuantity: l.countedQty,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'kinaxis',
    metadata: strMap({ reason: raw.reason, status: raw.status }),
    raw,
  }
}
