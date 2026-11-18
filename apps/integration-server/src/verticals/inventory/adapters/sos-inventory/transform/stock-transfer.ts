/**
 * SOS Inventory v2 stock transfer (inventory transfer) transform.
 *
 * The public v2 REST API does not include a dedicated transfer list endpoint.
 * This module is retained for structural parity; the adapter index does NOT
 * implement listStockTransfers / getStockTransfer.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSosInventoryStockTransfer {
  id: number | string
  number?: string
  fromLocation?: { id?: number | string; name?: string }
  toLocation?: { id?: number | string; name?: string }
  status?: string
  date?: string
  completedDate?: string
  lines?: Array<{
    item?: { id?: number | string; name?: string }
    quantity?: number
    received?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in transit': case 'shipped': return 'in_transit'
    case 'completed': case 'received': return 'completed'
    case 'voided': case 'cancelled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSosInventoryStockTransfer): StockTransfer {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    fromLocationId: raw.fromLocation?.id !== undefined ? String(raw.fromLocation.id) : '',
    toLocationId: raw.toLocation?.id !== undefined ? String(raw.toLocation.id) : '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.item?.id !== undefined ? String(l.item.id) : '',
      quantity: l.quantity ?? 0,
      quantityReceived: l.received,
    })),
    shippedAt: toIso(raw.date),
    receivedAt: toIso(raw.completedDate),
    platform: 'sos-inventory',
    metadata: strMap({}),
    raw,
  }
}
