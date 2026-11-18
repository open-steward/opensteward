/**
 * Transform Infor WMS transfer order records.
 *
 * Infor WMS transfer orders represent inter-warehouse moves and are
 * available at /WMS/transferorders. Key fields:
 *   transferOrderId     — internal WMS transfer identifier
 *   transferOrderNumber — external reference number
 *   fromWarehouseId     — source warehouse
 *   toWarehouseId       — destination warehouse
 *   status              — OPEN | IN_TRANSIT | RECEIVED | CLOSED | CANCELLED
 *   shippedDate         — date shipment left source
 *   receivedDate        — date received at destination
 *   lines               — transfer line items
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawInforWmsTransferOrderLine {
  lineNumber?: number | string
  itemNumber: string
  transferredQty?: number | string
  receivedQty?: number | string
  uom?: string
  [key: string]: unknown
}

export interface RawInforWmsTransferOrder {
  transferOrderId: string
  transferOrderNumber?: string
  fromWarehouseId?: string
  toWarehouseId?: string
  status?: string
  shippedDate?: string
  receivedDate?: string
  lines?: RawInforWmsTransferOrderLine[]
  ownerCode?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN': case 'PENDING': case 'DRAFT': return 'draft'
    case 'IN_TRANSIT': case 'SHIPPED': case 'DISPATCHED': return 'in_transit'
    case 'RECEIVED': case 'COMPLETED': case 'CLOSED': return 'completed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawInforWmsTransferOrder): StockTransfer {
  return {
    id: raw.transferOrderId,
    externalId: raw.transferOrderId,
    number: pickStr(raw.transferOrderNumber),
    fromLocationId: raw.fromWarehouseId ?? '',
    toLocationId: raw.toWarehouseId ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemNumber,
      quantity: pickNum(l.transferredQty) ?? 0,
      quantityReceived: pickNum(l.receivedQty),
    })),
    shippedAt: toIso(raw.shippedDate),
    receivedAt: toIso(raw.receivedDate),
    platform: 'infor-wms',
    metadata: strMap({
      ownerCode: raw.ownerCode,
    }),
    raw,
  }
}
