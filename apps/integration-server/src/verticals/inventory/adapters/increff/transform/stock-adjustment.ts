/**
 * Increff inventory adjustment transform.
 *
 * Increff records stock corrections as adjustment transactions against a
 * warehouse. Key fields:
 *   adjustmentCode   — unique identifier
 *   warehouseCode    — location where adjustment was made
 *   reason / remarks — free-text reason (mapped to enum)
 *   items            — line items: skuCode, deltaQty (signed), countedQty
 *   adjustedOn       — when the adjustment was posted
 *   adjustedBy       — username or operator ID
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawIncreffStockAdjustment {
  adjustmentCode: string
  warehouseCode?: string
  reason?: string
  remarks?: string
  status?: string
  items?: Array<{
    skuCode: string
    /** Signed delta (positive = increase, negative = decrease) */
    deltaQty: number
    countedQty?: number
    notes?: string
  }>
  adjustedOn?: string
  adjustedBy?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('correction')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawIncreffStockAdjustment): StockAdjustment {
  const reasonText = raw.reason ?? raw.remarks
  return {
    id: raw.adjustmentCode,
    externalId: raw.adjustmentCode,
    locationId: raw.warehouseCode ?? '',
    reason: mapReason(reasonText),
    lines: (raw.items ?? []).map((l) => ({
      productId: l.skuCode,
      deltaQuantity: l.deltaQty,
      countedQuantity: l.countedQty,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjustedOn) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'increff',
    metadata: strMap({ rawReason: reasonText, status: raw.status }),
    raw,
  }
}
