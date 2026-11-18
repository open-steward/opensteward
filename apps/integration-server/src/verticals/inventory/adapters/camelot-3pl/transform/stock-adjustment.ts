import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Camelot 3PL / Excalibur WMS — stock adjustment record.
 *
 * Returned by custom Inventory Out export profiles that include adjustment
 * transactions. Field names follow the standard Excalibur JSON export
 * convention used by third-party integration middleware.
 */
export interface RawCamelot3plStockAdjustment {
  adjustmentId: string
  warehouseId?: string
  adjustmentReason?: string
  status?: string
  lines?: Array<{
    itemId: string
    quantityDelta: number
    quantityCounted?: number
    notes?: string
  }>
  adjustmentDate?: string
  adjustedByUser?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('error')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawCamelot3plStockAdjustment): StockAdjustment {
  return {
    id: String(raw.adjustmentId),
    externalId: String(raw.adjustmentId),
    locationId: String(raw.warehouseId ?? ''),
    reason: mapReason(raw.adjustmentReason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      deltaQuantity: l.quantityDelta,
      countedQuantity: l.quantityCounted,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedByUser),
    platform: 'camelot-3pl',
    metadata: strMap({ rawReason: raw.adjustmentReason, status: raw.status }),
    raw,
  }
}
