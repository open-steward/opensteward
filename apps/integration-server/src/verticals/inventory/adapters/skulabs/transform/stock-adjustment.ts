import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Maps inventory history rows from GET /inventory/get_history.
 * Each row represents a single item adjustment at a location.
 */
export interface RawSkulabsInventoryHistoryRow {
  user_id?: string | null
  item_id: string
  location_id?: string
  change?: {
    type?: string
    quantity?: number
    notes?: string
  }
  time?: string
  old_value?: number
  sku?: string
  [key: string]: unknown
}

function mapReason(changeType: string | undefined, notes: string | undefined): StockAdjustmentReason {
  const t = (changeType ?? '').toLowerCase()
  const n = (notes ?? '').toLowerCase()
  if (n.includes('count') || n.includes('cycle')) return 'cycle_count'
  if (n.includes('damage')) return 'damage'
  if (n.includes('theft') || n.includes('steal')) return 'theft'
  if (n.includes('lost')) return 'lost'
  if (n.includes('found')) return 'found'
  if (n.includes('expir')) return 'expiration'
  if (n.includes('correct') || t === 'update') return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawSkulabsInventoryHistoryRow): StockAdjustment {
  const change = raw.change ?? {}
  const changeType = change.type ?? ''
  const notes = change.notes
  const delta = change.quantity ?? 0
  const adjustedDelta = changeType === 'decrease' ? -Math.abs(delta) : Math.abs(delta)

  return {
    id: `${raw.item_id}:${raw.location_id ?? ''}:${raw.time ?? ''}`,
    externalId: `${raw.item_id}:${raw.location_id ?? ''}:${raw.time ?? ''}`,
    locationId: raw.location_id ?? '',
    reason: mapReason(changeType, notes),
    lines: [
      {
        productId: raw.item_id,
        deltaQuantity: adjustedDelta,
        notes: pickStr(notes),
      },
    ],
    adjustedAt: toIso(raw.time) ?? new Date(0).toISOString(),
    adjustedBy: raw.user_id ? pickStr(raw.user_id) : undefined,
    platform: 'skulabs',
    metadata: strMap({ changeType, sku: raw.sku, oldValue: raw.old_value }),
    raw,
  }
}
