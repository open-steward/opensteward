/**
 * Versa Cloud ERP — stock transfer (transfer order) transform.
 *
 * API endpoint: GET /transfer.json  (or /order.json?order_type_id=5 depending on version)
 * Key response fields:
 *   id, transfer_number, from_location_id, to_location_id, status,
 *   transfer_lines: [{ item_id, quantity, quantity_received }]
 *   ship_date, completed_date
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawVersaTransferLine {
  item_id: string | number
  quantity: number | string
  quantity_received?: number | string
  [key: string]: unknown
}

export interface RawVersaStockTransfer {
  id: string | number
  transfer_number?: string
  from_location_id?: string | number
  to_location_id?: string | number
  status?: string
  transfer_lines?: RawVersaTransferLine[]
  lines?: RawVersaTransferLine[]
  ship_date?: string
  shipped_date?: string
  completed_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
    case 'open':
      return 'draft'
    case 'in transit':
    case 'shipped':
    case 'in_transit':
      return 'in_transit'
    case 'completed':
    case 'received':
      return 'completed'
    case 'voided':
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawVersaStockTransfer): StockTransfer {
  const id = String(raw.id)
  const lines = raw.transfer_lines ?? raw.lines ?? []

  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_number),
    fromLocationId: raw.from_location_id != null ? String(raw.from_location_id) : '',
    toLocationId: raw.to_location_id != null ? String(raw.to_location_id) : '',
    status: mapStatus(raw.status),
    lines: lines.map((l) => ({
      productId: String(l.item_id),
      quantity: Number(l.quantity) || 0,
      quantityReceived:
        l.quantity_received !== undefined ? Number(l.quantity_received) : undefined,
    })),
    shippedAt: toIso(raw.ship_date ?? raw.shipped_date),
    receivedAt: toIso(raw.completed_date),
    platform: 'versa-cloud-erp',
    metadata: strMap({}),
    raw,
  }
}
