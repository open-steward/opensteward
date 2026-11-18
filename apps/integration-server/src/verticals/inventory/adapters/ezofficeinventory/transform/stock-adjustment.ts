/**
 * EZO stock adjustment transform.
 *
 * EZO records stock additions and removals via:
 *   POST /api/v2/inventory/:id/add_stock    (positive delta)
 *   POST /api/v2/inventory/:id/remove_stock (negative delta)
 *   GET  /api/v2/inventory/:id/history      (shows adjustment events)
 *
 * History event fields (EZO v2):
 *   id, order_type (e.g. "Add Stock" | "Remove Stock" | "Inventory Audit"),
 *   is_transfer (bool, false for adjustments), quantity, location_id,
 *   location_name, created_at, user_full_name, comments/note
 *
 * The inventory_id is injected by the adapter.
 */
import type { StockAdjustment, StockAdjustmentReason } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawEZOStockAdjustment {
  /** injected by adapter from the parent inventory item id */
  inventory_id: number | string
  id?: number | string
  /** EZO v2 uses order_type (not action) for transaction classification */
  order_type?: string
  quantity?: number | string
  location_id?: number | string
  location_name?: string
  created_at?: string
  /** EZO v2 uses user_full_name (not done_by) */
  user_full_name?: string
  comments?: string
  note?: string
  [key: string]: unknown
}

function mapReason(orderType: string | undefined): StockAdjustmentReason {
  const a = (orderType ?? '').toLowerCase()
  if (a.includes('audit') || a.includes('count')) return 'cycle_count'
  if (a.includes('damage')) return 'damage'
  if (a.includes('theft') || a.includes('steal')) return 'theft'
  if (a.includes('lost') || a.includes('loss')) return 'lost'
  if (a.includes('found')) return 'found'
  if (a.includes('expir')) return 'expiration'
  if (a.includes('correct')) return 'correction'
  return 'other'
}

export function transformStockAdjustment(raw: RawEZOStockAdjustment): StockAdjustment {
  const inventoryId = String(raw.inventory_id)
  const eventId = raw.id != null ? String(raw.id) : ''
  const idStr = eventId ? `${inventoryId}:${eventId}` : inventoryId

  const rawQty = raw.quantity !== undefined ? Number(raw.quantity) : 0
  const qty = isNaN(rawQty) ? 0 : rawQty
  // Negative order_type (remove/checkout) events represent negative deltas
  const orderType = (raw.order_type ?? '').toLowerCase()
  const delta = orderType.includes('remove') || orderType.includes('checkout') ? -Math.abs(qty) : Math.abs(qty)

  return {
    id: idStr,
    externalId: idStr,
    locationId: raw.location_id != null ? String(raw.location_id) : '',
    reason: mapReason(raw.order_type),
    lines: [{
      productId: inventoryId,
      deltaQuantity: delta,
      countedQuantity: undefined,
      notes: pickStr(raw.comments ?? raw.note),
    }],
    adjustedAt: toIso(raw.created_at) ?? new Date(0).toISOString(),
    adjustedBy: pickStr(raw.user_full_name),
    platform: 'ezofficeinventory',
    metadata: strMap({
      orderType: raw.order_type,
      locationName: raw.location_name,
    }),
    raw,
  }
}
