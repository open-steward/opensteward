/**
 * Pipe17 /inventory/events?eventType=adjust -> StockAdjustment schema.
 *
 * In Pipe17 inventory adjustments are ledger events with eventType='adjust'.
 * Key fields (camelCase):
 *   eventId, locationId, reason, sku, productId, delta, counted, notes,
 *   adjustedAt (or createdAt), adjustedBy (or userId)
 *
 * Reference: Pipe17 Inventory Engine docs — "Adjust represents changes made
 * by a user to inventory."
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawPipe17AdjustEvent {
  eventId?: string
  locationId?: string
  reason?: string
  sku?: string
  productId?: string
  delta?: number
  deltaQuantity?: number
  counted?: number
  countedQuantity?: number
  notes?: string
  adjustedAt?: string
  adjustedBy?: string
  userId?: string
  createdAt?: string
  [key: string]: unknown
}

function mapReason(s: string | undefined): StockAdjustmentReason {
  const r = (s ?? '').toLowerCase()
  if (r.includes('count') || r.includes('cycle')) return 'cycle_count'
  if (r.includes('damage')) return 'damage'
  if (r.includes('theft') || r.includes('steal')) return 'theft'
  if (r.includes('lost') || r.includes('loss')) return 'lost'
  if (r.includes('found')) return 'found'
  if (r.includes('expir')) return 'expiration'
  if (r.includes('correct') || r.includes('adj')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawPipe17AdjustEvent): StockAdjustment {
  const id = pickStr(raw.eventId) ?? ''
  const productId = pickStr(raw.productId) ?? pickStr(raw.sku) ?? ''
  const delta = pickNum(raw.delta ?? raw.deltaQuantity) ?? 0
  const counted = pickNum(raw.counted ?? raw.countedQuantity)
  const adjustedAt = toIso(raw.adjustedAt ?? raw.createdAt) ?? new Date(0).toISOString()
  return {
    id,
    externalId: id,
    locationId: pickStr(raw.locationId) ?? '',
    reason: mapReason(raw.reason),
    lines: [{
      productId,
      deltaQuantity: delta,
      countedQuantity: counted,
      notes: pickStr(raw.notes),
    }],
    adjustedAt,
    adjustedBy: pickStr(raw.adjustedBy) ?? pickStr(raw.userId),
    platform: 'pipe17',
    metadata: strMap({ reason: raw.reason, eventId: raw.eventId }),
    raw,
  }
}
