/**
 * Da Vinci Unified — transfer order transform.
 *
 * DVU inter-warehouse moves come from /api/transfer/transferOrders.
 * Key fields: transferId, transferNumber, fromWarehouseId, toWarehouseId,
 * status, lines[].itemId, lines[].quantity, lines[].quantityReceived,
 * shipDate, completedDate.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawDaVinciUnifiedStockTransfer {
  transferId: string
  transferNumber?: string
  fromWarehouseId?: string
  toWarehouseId?: string
  status?: string
  lines?: Array<{ itemId: string; quantity: number; quantityReceived?: number }>
  shipDate?: string
  completedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'OPEN':
      return 'draft'
    case 'IN TRANSIT':
    case 'SHIPPED':
      return 'in_transit'
    case 'COMPLETED':
    case 'RECEIVED':
      return 'completed'
    case 'VOIDED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawDaVinciUnifiedStockTransfer): StockTransfer {
  return {
    id: raw.transferId,
    externalId: raw.transferId,
    number: pickStr(raw.transferNumber),
    fromLocationId: raw.fromWarehouseId ?? '',
    toLocationId: raw.toWarehouseId ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId,
      quantity: l.quantity,
      quantityReceived: l.quantityReceived,
    })),
    shippedAt: toIso(raw.shipDate),
    receivedAt: toIso(raw.completedDate),
    platform: 'da-vinci-unified',
    metadata: strMap({}),
    raw,
  }
}
