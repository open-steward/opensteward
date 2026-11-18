/**
 * Transform E2open shipment collaboration records into canonical StockTransfer.
 *
 * E2open's Shipment Collaboration API (part of Supply Chain Collaboration)
 * models inter-location shipments. Fields follow the SCPM / CDM Shipment entity.
 *
 * Fields:
 *   shipmentId          — e2open internal shipment record ID
 *   shipmentNumber      — client-assigned shipment reference
 *   fromLocationId      — origin warehouse identifier
 *   toLocationId        — destination warehouse identifier
 *   status              — shipment lifecycle status
 *   lines[]
 *     itemId / partnerSkuCode — product identifier
 *     shippedQty          — quantity shipped
 *     receivedQty         — quantity received
 *   shipDate            — date/time shipment left origin
 *   receiptDate         — date/time shipment received at destination
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawE2openStockTransferLine {
  itemId?: string
  partnerSkuCode?: string
  shippedQty?: number | string
  receivedQty?: number | string
  [key: string]: unknown
}

export interface RawE2openStockTransfer {
  shipmentId?: string
  shipmentNumber?: string
  fromLocationId?: string
  toLocationId?: string
  status?: string
  lines?: RawE2openStockTransferLine[]
  shipDate?: string
  receiptDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'PLANNED':
    case 'CREATED':
      return 'draft'
    case 'IN_TRANSIT':
    case 'IN TRANSIT':
    case 'SHIPPED':
    case 'DISPATCHED':
      return 'in_transit'
    case 'COMPLETED':
    case 'RECEIVED':
    case 'DELIVERED':
      return 'completed'
    case 'CANCELLED':
    case 'VOIDED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformStockTransfer(raw: RawE2openStockTransfer): StockTransfer {
  const id = pickStr(raw.shipmentId) ?? pickStr(raw.shipmentNumber) ?? ''

  return {
    id,
    externalId:     id,
    number:         pickStr(raw.shipmentNumber),
    fromLocationId: pickStr(raw.fromLocationId) ?? '',
    toLocationId:   pickStr(raw.toLocationId)   ?? '',
    status:         mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId:        pickStr(l.itemId) ?? pickStr(l.partnerSkuCode) ?? '',
      quantity:         pickNum(l.shippedQty)  ?? 0,
      quantityReceived: pickNum(l.receivedQty),
    })),
    shippedAt:  toIso(raw.shipDate),
    receivedAt: toIso(raw.receiptDate),
    platform:   'e2open',
    metadata:   strMap({}),
    raw,
  }
}
