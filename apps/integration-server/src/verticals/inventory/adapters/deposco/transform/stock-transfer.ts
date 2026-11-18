/**
 * Transform a Deposco WMS transfer order into the canonical StockTransfer shape.
 *
 * Endpoint: GET /orders/Transfer%20Order  or  GET /orders/Transfer%20Order/{orderNumber}
 *
 * Field notes:
 *   orderNumber           — primary key
 *   fromFacilityNumber    — source facility/location
 *   toFacilityNumber      — destination facility/location
 *   status                — OPEN | IN TRANSIT | RECEIVED | CLOSED | CANCELLED
 *   lines[].itemNumber    — product SKU
 *   lines[].quantity      — qty transferred
 *   lines[].quantityReceived — qty confirmed received
 *   shipDate              — ISO date shipped
 *   completedDate         — ISO date transfer completed/received
 */
import type { StockTransfer, StockTransferStatus } from '../../../schema'
import {pickNum, strMap, toIso} from './shared'

export interface RawDeposcoTransferOrder {
  orderNumber: string
  fromFacilityNumber?: string
  toFacilityNumber?: string
  status?: string
  lines?: Array<{
    itemNumber: string
    quantity: number | string
    quantityReceived?: number | string
  }>
  shipDate?: string
  completedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): StockTransferStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN': case 'DRAFT': return 'draft'
    case 'IN TRANSIT': case 'SHIPPED': return 'in_transit'
    case 'RECEIVED': case 'COMPLETED': case 'CLOSED': return 'completed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformStockTransfer(raw: RawDeposcoTransferOrder): StockTransfer {
  return {
    id: raw.orderNumber,
    externalId: raw.orderNumber,
    number: raw.orderNumber,
    fromLocationId: raw.fromFacilityNumber ?? '',
    toLocationId: raw.toFacilityNumber ?? '',
    status: mapStatus(raw.status),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemNumber,
      quantity: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.quantityReceived),
    })),
    shippedAt: toIso(raw.shipDate),
    receivedAt: toIso(raw.completedDate),
    platform: 'deposco',
    metadata: strMap({}),
    raw,
  }
}
