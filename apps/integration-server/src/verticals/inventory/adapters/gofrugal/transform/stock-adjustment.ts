/**
 * GoFrugal RetailEasy stock-adjustment transform.
 *
 * GoFrugal's public WebReporter API (api/v1) does not expose a stock-adjustment
 * listing endpoint. This file is a placeholder for future use. The adapter
 * does NOT implement listStockAdjustments / getStockAdjustment.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawGofrugalStockAdjustment {
  adjustmentId: number | string
  locationId?: number | string
  reason?: string
  status?: string
  adjustedBy?: string
  adjustedAt?: string
  lines?: Array<{
    itemId: number | string
    deltaQty: number
    countedQty?: number
    notes?: string
  }>
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawGofrugalStockAdjustment): StockAdjustment {
  const id = String(raw.adjustmentId)
  return {
    id,
    externalId: id,
    locationId: raw.locationId != null ? String(raw.locationId) : '',
    reason: mapReason(raw.reason),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      deltaQuantity: l.deltaQty,
      countedQuantity: l.countedQty,
      notes: pickStr(l.notes),
    })),
    adjustedAt: toIso(raw.adjustedAt) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.adjustedBy),
    platform: 'gofrugal',
    metadata: strMap({ rawReason: raw.reason, status: raw.status }),
    raw,
  }
}
