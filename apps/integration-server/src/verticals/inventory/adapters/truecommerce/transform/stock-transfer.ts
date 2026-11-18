/**
 * TrueCommerce stock-transfer transform.
 *
 * Maps GET /v1/stock-transfers response fields:
 *   transfer_id, transfer_number, from_location_id, to_location_id,
 *   status, line_items, shipped_date, received_date
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawTruecommerceStockTransferLine {
  item_id: string
  quantity: number
  qty_received?: number
}

export interface RawTruecommerceStockTransfer {
  transfer_id: string
  transfer_number?: string
  from_location_id?: string
  to_location_id?: string
  status?: string
  line_items?: RawTruecommerceStockTransferLine[]
  shipped_date?: string
  received_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in_transit':
    case 'in transit':
    case 'shipped': return 'in_transit'
    case 'completed':
    case 'received': return 'completed'
    case 'cancelled':
    case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawTruecommerceStockTransfer): StockTransfer {
  return {
    id: raw.transfer_id,
    externalId: raw.transfer_id,
    number: pickStr(raw.transfer_number),
    fromLocationId: raw.from_location_id ?? '',
    toLocationId: raw.to_location_id ?? '',
    status: mapStatus(raw.status),
    lines: (raw.line_items ?? []).map((l) => ({
      productId: l.item_id,
      quantity: l.quantity,
      quantityReceived: l.qty_received,
    })),
    shippedAt: toIso(raw.shipped_date),
    receivedAt: toIso(raw.received_date),
    platform: 'truecommerce',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
