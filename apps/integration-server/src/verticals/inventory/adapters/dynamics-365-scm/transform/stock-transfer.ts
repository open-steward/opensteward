/**
 * Transform D365 SCM TransferOrderHeader + TransferOrderLine → canonical StockTransfer.
 *
 * OData entity: TransferOrderHeaders (joined with TransferOrderLines)
 * Header key fields:
 *   TransferOrderNumber           — primary key
 *   TransferOrderStatus           — "Open" | "Shipped" | "Received" | "Annulled" | "None"
 *   InventLocationIdFrom          — origin warehouse ID
 *   InventLocationIdTo            — destination warehouse ID
 *   ShipDate                      — actual ship date (ISO or /Date(ms)/)
 *   ReceiveDate                   — actual receive date
 *   RequestedShippingDate         — planned ship date
 *   DataAreaId                    — legal entity
 *
 * Line key fields:
 *   TransferOrderNumber           — FK to header
 *   LineNumber                    — line number
 *   ItemNumber                    — product item number
 *   TransferQuantity              — quantity ordered
 *   RemainInventPhysical          — quantity not yet received (header - received)
 *   QtyTransferred                — quantity already transferred/shipped
 *   QtyReceived                   — quantity received at destination
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawD365TransferOrderLine {
  TransferOrderNumber: string
  LineNumber?: number | string
  ItemNumber: string
  TransferQuantity?: number | string
  RemainInventPhysical?: number | string
  QtyTransferred?: number | string
  QtyReceived?: number | string
  [key: string]: unknown
}

export interface RawD365TransferOrder {
  TransferOrderNumber: string
  TransferOrderStatus?: string
  InventLocationIdFrom?: string
  InventLocationIdTo?: string
  ShipDate?: string
  ReceiveDate?: string
  RequestedShippingDate?: string
  DataAreaId?: string
  TransferOrderLines?: RawD365TransferOrderLine[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'none':
    case 'open':
    case 'created':
      return 'draft'
    case 'shipped':
    case 'intransit':
    case 'in transit':
      return 'in_transit'
    case 'received':
    case 'completed':
      return 'completed'
    case 'annulled':
    case 'cancelled':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawD365TransferOrder): StockTransfer {
  return {
    id: raw.TransferOrderNumber,
    externalId: raw.TransferOrderNumber,
    number: pickStr(raw.TransferOrderNumber),
    fromLocationId: pickStr(raw.InventLocationIdFrom) ?? '',
    toLocationId: pickStr(raw.InventLocationIdTo) ?? '',
    status: mapStatus(raw.TransferOrderStatus),
    lines: (raw.TransferOrderLines ?? []).map((l) => ({
      productId: l.ItemNumber,
      quantity: pickNum(l.TransferQuantity) ?? 0,
      quantityReceived: pickNum(l.QtyReceived),
    })),
    shippedAt: toIso(raw.ShipDate),
    receivedAt: toIso(raw.ReceiveDate),
    platform: 'dynamics-365-scm',
    metadata: strMap({
      dataAreaId: raw.DataAreaId,
      transferOrderStatus: raw.TransferOrderStatus,
      requestedShippingDate: raw.RequestedShippingDate,
    }),
    raw,
  }
}
