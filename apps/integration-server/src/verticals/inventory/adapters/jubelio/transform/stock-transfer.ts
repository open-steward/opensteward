/**
 * Jubelio stock-transfer transform.
 *
 * GET /inventory/transfers/out     → outbound transfers list
 * GET /inventory/transfers/in      → inbound transfers list
 * GET /inventory/transfers/{id}    → single transfer
 *
 * Field names sourced from Jubelio transfer API.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawJubelioStockTransfer {
  transfer_id: number | string
  transfer_no?: string
  from_location_id?: number | string
  from_location_name?: string
  to_location_id?: number | string
  to_location_name?: string
  status?: string
  transfer_date?: string
  receive_date?: string
  items?: Array<{
    item_id: number | string
    qty?: number | string
    qty_received?: number | string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'open':
    case 'transit':
    case 'in transit':
    case 'shipped': return 'in_transit'
    case 'received':
    case 'completed': return 'completed'
    case 'cancelled':
    case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawJubelioStockTransfer): StockTransfer {
  const id = String(raw.transfer_id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_no),
    fromLocationId: raw.from_location_id != null ? String(raw.from_location_id) : '',
    toLocationId: raw.to_location_id != null ? String(raw.to_location_id) : '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.item_id),
      quantity: pickNum(l.qty) ?? 0,
      quantityReceived: pickNum(l.qty_received),
    })),
    shippedAt: toIso(raw.transfer_date),
    receivedAt: toIso(raw.receive_date),
    platform: 'jubelio',
    metadata: strMap({
      fromLocationName: raw.from_location_name,
      toLocationName: raw.to_location_name,
    }),
    raw,
  }
}
