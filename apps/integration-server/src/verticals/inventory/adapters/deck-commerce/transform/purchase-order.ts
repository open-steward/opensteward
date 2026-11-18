/**
 * Deck Commerce does not expose a purchase order REST endpoint in its OMS API.
 * Purchase orders are managed in the upstream ERP/WMS.
 *
 * This transform is present for completeness and handles any future PO data
 * that may be added to the API.
 *
 * Field names follow the Deck Commerce naming convention where documented:
 * PaONumber, SupplierCode, DestinationWarehouse, Status, Currency, TotalAmount,
 * ExpectedDateUTC, IssuedDateUTC, Lines[].SKU / Qty / ReceivedQty / UnitCost
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawDeckCommercePurchaseOrder {
  PurchaseOrderID?: string
  PoNumber?: string
  SupplierCode?: string
  SupplierID?: string
  DestinationWarehouse?: string
  Status?: string
  Currency?: string
  TotalAmount?: number
  SubtotalAmount?: number
  Lines?: Array<{
    SKU: string
    Qty: number
    ReceivedQty?: number
    UnitCost?: number
    LineTotal?: number
  }>
  IssuedDateUTC?: string
  ExpectedDateUTC?: string
  ReceivedDateUTC?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'ISSUED': case 'OPEN': case 'SENT': case 'ORDERED': return 'sent'
    case 'PARTIALLYRECEIVED': case 'PARTIALLY RECEIVED': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'COMPLETED': case 'CLOSED': return 'closed'
    case 'VOIDED': case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawDeckCommercePurchaseOrder): PurchaseOrder {
  const id = pickStr(raw.PurchaseOrderID) ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.PoNumber),
    supplierId: pickStr(raw.SupplierID ?? raw.SupplierCode) ?? '',
    destinationLocationId: pickStr(raw.DestinationWarehouse),
    status: mapStatus(raw.Status),
    currency: pickStr(raw.Currency),
    subtotalAmount: raw.SubtotalAmount,
    totalAmount: raw.TotalAmount,
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.SKU,
      quantityOrdered: l.Qty,
      quantityReceived: l.ReceivedQty,
      unitCost: l.UnitCost,
      lineTotal: l.LineTotal,
    })),
    expectedAt: toIso(raw.ExpectedDateUTC),
    orderedAt: toIso(raw.IssuedDateUTC),
    receivedAt: toIso(raw.ReceivedDateUTC),
    platform: 'deck-commerce',
    metadata: strMap({}),
    raw,
  }
}
