import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Sumtracker stock transfer object as returned by GET /stock_transfers
 * or GET /stock_transfers/:id.
 */
export interface RawSumtrackerStockTransfer {
  id: string | number
  transfer_number?: string
  from_warehouse_id?: string | number
  to_warehouse_id?: string | number
  status?: string
  items?: Array<{
    product_id: string | number
    quantity: number | string
    received_qty?: number | string
  }>
  transfer_date?: string
  received_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in_transit': case 'in transit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSumtrackerStockTransfer): StockTransfer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.transfer_number),
    fromLocationId: raw.from_warehouse_id !== undefined ? String(raw.from_warehouse_id) : '',
    toLocationId: raw.to_warehouse_id !== undefined ? String(raw.to_warehouse_id) : '',
    status: mapStatus(raw.status),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.product_id),
      quantity: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.received_qty),
    })),
    shippedAt: toIso(raw.transfer_date),
    receivedAt: toIso(raw.received_date),
    platform: 'sumtracker',
    metadata: strMap({}),
    raw,
  }
}
