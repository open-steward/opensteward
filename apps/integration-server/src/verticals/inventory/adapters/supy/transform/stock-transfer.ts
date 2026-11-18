/**
 * Supy "transfer" → canonical StockTransfer transform.
 *
 * Supy supports inter-branch stock transfers, including transfers to/from a
 * central kitchen. Status values follow draft → in_transit → completed.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSupyTransferLine {
  itemId: string
  quantity: number
  receivedQuantity?: number
  [key: string]: unknown
}

export interface RawSupyTransfer {
  id: string
  transferNumber?: string
  fromBranchId?: string
  toBranchId?: string
  status?: string
  lines?: RawSupyTransferLine[]
  shippedAt?: string
  receivedAt?: string
  notes?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
    case 'pending': return 'draft'
    case 'in_transit':
    case 'in-transit':
    case 'shipped': return 'in_transit'
    case 'completed':
    case 'received': return 'completed'
    case 'cancelled':
    case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawSupyTransfer): StockTransfer {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: pickStr(raw.transferNumber),
    fromLocationId: pickStr(raw.fromBranchId) ?? '',
    toLocationId: pickStr(raw.toBranchId) ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      quantity: l.quantity,
      quantityReceived: l.receivedQuantity,
    })),
    shippedAt: toIso(raw.shippedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'supy',
    metadata: strMap({ notes: raw.notes }),
    raw,
  }
}
