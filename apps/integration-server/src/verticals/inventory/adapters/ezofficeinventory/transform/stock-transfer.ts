/**
 * EZO stock transfer transform.
 *
 * EZO exposes inventory stock transfers via:
 *   POST /api/v2/inventory/:id/transfer_stock
 *   GET  /api/v2/inventory/:id/history  (shows transfer events)
 *
 * The history endpoint returns events with these fields:
 *   id, order_type, is_transfer (bool), quantity, transfer_from_location_id,
 *   checked_out_to_location_id, checked_in_from_location_id,
 *   created_at, user_full_name (member name)
 *
 * We model each transfer history event as a StockTransfer.
 * The inventory_id is injected by the adapter.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {strMap, toIso} from './shared'

export interface RawEZOStockTransfer {
  /** injected by adapter from the parent inventory item id */
  inventory_id: number | string
  id?: number | string
  /** EZO v2 uses order_type (not action) for transaction classification */
  order_type?: string
  /** EZO v2 uses is_transfer boolean to identify transfer events */
  is_transfer?: boolean | number
  quantity?: number | string
  /** EZO v2 uses transfer_from_location_id (not from_location_id) */
  transfer_from_location_id?: number | string
  checked_out_to_location_id?: number | string
  checked_in_from_location_id?: number | string
  created_at?: string
  /** EZO v2 uses user_full_name (not done_by) */
  user_full_name?: string
  status?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'in transit': case 'in_transit': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'completed'
  }
}

export function transformStockTransfer(raw: RawEZOStockTransfer): StockTransfer {
  const inventoryId = String(raw.inventory_id)
  const eventId = raw.id != null ? String(raw.id) : ''
  const idStr = eventId ? `${inventoryId}:${eventId}` : inventoryId

  const qty = raw.quantity !== undefined ? Number(raw.quantity) : 0

  // EZO v2: transfer_from_location_id is the source; checked_out_to_location_id is destination
  const fromLocId = raw.transfer_from_location_id != null
    ? String(raw.transfer_from_location_id)
    : (raw.checked_in_from_location_id != null ? String(raw.checked_in_from_location_id) : '')
  const toLocId = raw.checked_out_to_location_id != null ? String(raw.checked_out_to_location_id) : ''

  return {
    id: idStr,
    externalId: idStr,
    number: eventId || undefined,
    fromLocationId: fromLocId,
    toLocationId: toLocId,
    status: mapStatus(raw.status),
    lines: [{
      productId: inventoryId,
      quantity: isNaN(qty) ? 0 : qty,
      quantityReceived: undefined,
    }],
    shippedAt: toIso(raw.created_at),
    receivedAt: undefined,
    platform: 'ezofficeinventory',
    metadata: strMap({
      orderType: raw.order_type,
      userFullName: raw.user_full_name,
    }),
    raw,
  }
}
