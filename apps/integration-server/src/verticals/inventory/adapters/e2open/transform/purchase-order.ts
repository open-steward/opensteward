/**
 * Transform E2open purchase order collaboration records into canonical PurchaseOrder.
 *
 * E2open Supply Chain Collaboration (Discrete Order Collaboration) exposes POs
 * via the CDM API and the Supply Chain Process Manager (SCPM) REST API.
 *
 * Key fields from the e2open PO collaboration schema:
 *   purchaseOrderId         — e2open internal PO record ID
 *   purchaseOrderNumber     — buyer's PO number
 *   supplierId / zymeId     — supplier partner identifier
 *   buyerId                 — buying organisation ID
 *   status                  — PO lifecycle status string
 *   currencyCode            — ISO-4217 currency
 *   totalAmount             — PO total (float in the currency)
 *   subTotalAmount          — sub-total before tax/shipping
 *   shipToLocationId        — destination warehouse/location
 *   lines[]
 *     lineNumber            — sequence number
 *     itemId / partnerSkuCode — product identifier
 *     orderedQty            — quantity ordered
 *     receivedQty           — quantity received to date
 *     unitPrice             — unit cost (float in the currency)
 *     lineTotal             — line extension amount
 *   orderDate               — ISO date PO was placed
 *   requestedDeliveryDate   — requested delivery date
 *   confirmedDeliveryDate   — supplier-confirmed delivery date
 *   receiptDate             — actual receipt date
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso, toMinorUnits} from './shared'

export interface RawE2openPurchaseOrderLine {
  lineNumber?: number | string
  itemId?: string
  partnerSkuCode?: string
  orderedQty?: number | string
  receivedQty?: number | string
  unitPrice?: number | string
  lineTotal?: number | string
  [key: string]: unknown
}

export interface RawE2openPurchaseOrder {
  purchaseOrderId?: string
  purchaseOrderNumber?: string
  supplierId?: string
  zymeId?: string
  buyerId?: string
  status?: string
  currencyCode?: string
  totalAmount?: number | string
  subTotalAmount?: number | string
  shipToLocationId?: string
  lines?: RawE2openPurchaseOrderLine[]
  orderDate?: string
  requestedDeliveryDate?: string
  confirmedDeliveryDate?: string
  receiptDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'NEW':
    case 'CREATED':
      return 'draft'
    case 'SENT':
    case 'ORDERED':
    case 'ACKNOWLEDGED':
    case 'CONFIRMED':
      return 'sent'
    case 'PARTIALLY RECEIVED':
    case 'PARTIAL_RECEIPT':
      return 'partially_received'
    case 'RECEIVED':
    case 'RECEIPT':
      return 'received'
    case 'COMPLETED':
    case 'CLOSED':
    case 'FINAL':
      return 'closed'
    case 'CANCELLED':
    case 'VOIDED':
    case 'REJECTED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawE2openPurchaseOrder): PurchaseOrder {
  const id         = pickStr(raw.purchaseOrderId) ?? pickStr(raw.purchaseOrderNumber) ?? ''
  const currency   = pickStr(raw.currencyCode) ?? 'USD'
  const supplierId = pickStr(raw.supplierId) ?? pickStr(raw.zymeId) ?? ''

  return {
    id,
    externalId:           id,
    number:               pickStr(raw.purchaseOrderNumber),
    supplierId,
    destinationLocationId: pickStr(raw.shipToLocationId),
    status:               mapStatus(raw.status),
    currency,
    // Amounts stored as integer minor units (cents)
    subtotalAmount:       toMinorUnits(raw.subTotalAmount),
    totalAmount:          toMinorUnits(raw.totalAmount),
    lines: (raw.lines ?? []).map((l) => ({
      productId:        pickStr(l.itemId) ?? pickStr(l.partnerSkuCode) ?? '',
      quantityOrdered:  pickNum(l.orderedQty)  ?? 0,
      quantityReceived: pickNum(l.receivedQty),
      unitCost:         toMinorUnits(l.unitPrice),
      lineTotal:        toMinorUnits(l.lineTotal),
    })),
    expectedAt:  toIso(raw.confirmedDeliveryDate) ?? toIso(raw.requestedDeliveryDate),
    orderedAt:   toIso(raw.orderDate),
    receivedAt:  toIso(raw.receiptDate),
    platform:    'e2open',
    metadata:    strMap({
      buyerId:               raw.buyerId,
      requestedDeliveryDate: raw.requestedDeliveryDate,
      confirmedDeliveryDate: raw.confirmedDeliveryDate,
    }),
    raw,
  }
}
