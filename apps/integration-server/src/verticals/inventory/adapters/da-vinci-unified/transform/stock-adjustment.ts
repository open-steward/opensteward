/**
 * Da Vinci Unified — inventory adjustment transform.
 *
 * DVU inventory adjustments come from /api/inventory/adjustments.
 * Key fields: adjustmentId, warehouseId, adjustmentReason, status,
 * lines[].itemId, lines[].quantityAdjusted, lines[].quantityCounted,
 * lines[].notes, adjustmentDate, adjustedByUser.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawDaVinciUnifiedStockAdjustment {
  adjustmentId: string
  warehouseId?: string
  adjustmentReason?: string
  status?: string
  lines?: Array<{
    itemId: string
    quantityAdjusted: number
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
  if (r.includes('theft') || r.includes('stolen')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('adjustment')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawDaVinciUnifiedStockAdjustment): StockAdjustment {
  return {
    id: raw.adjustmentId,
    externalId: raw.adjustmentId,
    locationId: raw.warehouseId ?? '',
    reason: mapReason(raw.adjustmentReason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId,
      deltaQuantity: l.quantityAdjusted,
      countedQuantity: l.quantityCounted,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjustmentDate) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedByUser),
    platform: 'da-vinci-unified',
    metadata: strMap({ rawReason: raw.adjustmentReason, status: raw.status }),
    raw,
  }
}
