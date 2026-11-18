import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * SKUSavvy GraphQL stock take / inventory adjustment node.
 * SKUSavvy calls these "stock takes" in its UI.
 */
export interface RawSkusavvyStockAdjustment {
  id: string
  locationId?: string
  reason?: string
  status?: string
  lineItems?: Array<{
    productId: string
    adjustmentQty: number
    countedQty?: number
    notes?: string
  }>
  adjustedAt?: string
  adjustedBy?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('stock_take') || r.includes('stocktake')) return 'cycle_count'
  if (r.includes('damage') || r.includes('damaged')) return 'damage'
  if (r.includes('theft') || r.includes('stolen')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('adjust')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSkusavvyStockAdjustment): StockAdjustment {
  return {
    id: raw.id,
    externalId: raw.id,
    locationId: raw.locationId ?? '',
    reason: mapReason(raw.reason),
    lines: (raw.lineItems ?? []).map((l) => ({
      productId: l.productId,
      deltaQuantity: l.adjustmentQty,
      countedQuantity: l.countedQty,
      notes: l.notes,
    })),
    adjustedAt: toIso(raw.adjustedAt) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'skusavvy',
    metadata: strMap({ reason: raw.reason, status: raw.status }),
    raw,
  }
}
