/**
 * Pipe17 /transfers endpoint -> StockTransfer schema.
 *
 * Pipe17 transfer order key fields (camelCase):
 *   transferId, number, fromLocationId, toLocationId, status,
 *   lines[].sku, lines[].productId, lines[].quantity, lines[].quantityReceived,
 *   shippedAt, receivedAt, createdAt, updatedAt
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawPipe17TransferLine {
  sku?: string
  productId?: string
  quantity?: number
  quantityReceived?: number
  [key: string]: unknown
}

export interface RawPipe17Transfer {
  transferId?: string
  number?: string
  fromLocationId?: string
  toLocationId?: string
  status?: string
  lines?: RawPipe17TransferLine[]
  shippedAt?: string
  receivedAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'in_transit': case 'intransit': case 'shipped': case 'open': return 'in_transit'
    case 'completed': case 'received': case 'complete': return 'completed'
    case 'cancelled': case 'canceled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawPipe17Transfer): StockTransfer {
  const id = pickStr(raw.transferId) ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    fromLocationId: pickStr(raw.fromLocationId) ?? '',
    toLocationId: pickStr(raw.toLocationId) ?? '',
    status: mapStatus(raw.status),
    lines: (Array.isArray(raw.lines) ? raw.lines : []).map((l) => ({
      productId: pickStr(l.productId) ?? pickStr(l.sku) ?? '',
      quantity: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.quantityReceived),
    })),
    shippedAt: toIso(raw.shippedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'pipe17',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
