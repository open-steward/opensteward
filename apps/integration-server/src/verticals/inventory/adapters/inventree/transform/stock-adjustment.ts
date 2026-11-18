import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'
import type { RawInvenTreeStockTracking } from './stock-transfer'

/**
 * Stock adjustments in InvenTree are represented as StockTracking entries with
 * tracking_type codes: 10 (stock count), 3 (add stock), 4 (remove stock),
 * 5 (build order output), etc.
 *
 * We surface tracking_type 10 (count), 3 (add), 4 (remove) as adjustments.
 * The label field holds a human-readable reason.
 */

// Re-export for convenience — adjustments use the same raw shape
export type { RawInvenTreeStockTracking as RawInvenTreeStockAdjustment }

function mapReason(trackingType: number | undefined, label: string | undefined): StockAdjustmentReason {
  const l = (label ?? '').toLowerCase()
  if (trackingType === 10) return 'cycle_count'
  if (l.includes('count')) return 'cycle_count'
  if (l.includes('damage')) return 'damage'
  if (l.includes('theft') || l.includes('steal')) return 'theft'
  if (l.includes('lost') || l.includes('loss')) return 'lost'
  if (l.includes('found')) return 'found'
  if (l.includes('expir')) return 'expiration'
  if (l.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawInvenTreeStockTracking): StockAdjustment {
  const id = String(raw.pk)
  const prevQty = pickNum(raw.deltas?.quantity?.prev) ?? 0
  const newQty = pickNum(raw.deltas?.quantity?.new) ?? 0
  const delta = newQty - prevQty

  return {
    id,
    externalId: id,
    locationId: raw.deltas?.location?.new != null ? String(raw.deltas.location.new) : '',
    reason: mapReason(raw.tracking_type, raw.label),
    lines: [{
      productId: String(raw.item),
      deltaQuantity: delta,
      countedQuantity: raw.tracking_type === 10 ? newQty : undefined,
      notes: pickStr(raw.notes),
    }],
    adjustedAt: toIso(raw.date) ?? new Date(0).toISOString(),
    adjustedBy: raw.user != null ? String(raw.user) : undefined,
    platform: 'inventree',
    metadata: strMap({
      label: raw.label,
      trackingType: raw.tracking_type,
    }),
    raw,
  }
}
