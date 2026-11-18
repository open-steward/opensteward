/**
 * Manhattan Active WM — inventory transfer transform.
 *
 * WM REST endpoint:
 *   GET /wm/v1/inventory-transfers
 *   GET /wm/v1/inventory-transfers/{transferId}
 *
 * Transfers represent movements of stock between locations (bins, zones, or
 * facilities) within the warehouse network.
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawManhattanActiveTransfer {
  transferId: string
  transferNumber?: string
  fromLocationId?: string
  fromLocationName?: string
  toLocationId?: string
  toLocationName?: string
  status?: string
  lines?: Array<{
    itemId: string
    quantity: number
    quantityReceived?: number
  }>
  shipDateTime?: string
  completedDateTime?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'CREATED': case 'PENDING': return 'draft'
    case 'IN_TRANSIT': case 'SHIPPED': case 'IN TRANSIT': return 'in_transit'
    case 'COMPLETED': case 'RECEIVED': return 'completed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawManhattanActiveTransfer): StockTransfer {
  return {
    id: raw.transferId,
    externalId: raw.transferId,
    number: pickStr(raw.transferNumber),
    fromLocationId: pickStr(raw.fromLocationId) ?? '',
    toLocationId: pickStr(raw.toLocationId) ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId,
      quantity: l.quantity,
      quantityReceived: l.quantityReceived,
    })),
    shippedAt: toIso(raw.shipDateTime),
    receivedAt: toIso(raw.completedDateTime),
    platform: 'manhattan-active',
    metadata: strMap({
      fromLocationName: raw.fromLocationName,
      toLocationName: raw.toLocationName,
    }),
    raw,
  }
}
