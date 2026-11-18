/**
 * Transform Crunchtime Purchase Order → canonical PurchaseOrder.
 *
 * Source: GET /purchaseorder/v1/getAllPurchaseOrders
 *         GET /purchaseorder/v1/getPurchaseOrdersByPage
 *
 * Key Crunchtime field names:
 *   purchaseOrderNumber, vendorCode, locationCode, status, currency,
 *   orderDate, expectedDeliveryDate, actualDeliveryDate, invoiceDate,
 *   orderType, purchaseOrderLines[].productNumber, .quantity, .receivedQuantity,
 *   .unitCost, .lineTotal
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawCrunchtimePurchaseOrderLine {
  productNumber: string
  quantity?: number
  receivedQuantity?: number
  unitCost?: number
  lineTotal?: number
  [key: string]: unknown
}

export interface RawCrunchtimePurchaseOrder {
  purchaseOrderNumber: string
  vendorCode?: string
  vendorName?: string
  locationCode?: string
  status?: string
  currency?: string
  orderTotal?: number
  subTotal?: number
  orderDate?: string
  expectedDeliveryDate?: string
  actualDeliveryDate?: string
  invoiceDate?: string
  submitDate?: string
  reconcileDate?: string
  orderType?: string
  vendorInvoiceNumber?: string
  purchaseOrderLines?: RawCrunchtimePurchaseOrderLine[]
  [key: string]: unknown
}

/** Convert a decimal-dollar amount to integer minor units (cents). */
function toMinorUnits(v: unknown): number | undefined {
  const n = pickNum(v)
  if (n == null) return undefined
  return Math.round(n * 100)
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'PENDING':
      return 'draft'
    case 'SUBMITTED':
    case 'ORDERED':
    case 'SENT':
      return 'sent'
    case 'PARTIALLY RECEIVED':
    case 'PARTIAL':
      return 'partially_received'
    case 'RECEIVED':
    case 'DELIVERED':
      return 'received'
    case 'COMPLETED':
    case 'CLOSED':
    case 'RECONCILED':
      return 'closed'
    case 'VOIDED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawCrunchtimePurchaseOrder): PurchaseOrder {
  return {
    id: raw.purchaseOrderNumber,
    externalId: raw.purchaseOrderNumber,
    number: raw.purchaseOrderNumber,
    supplierId: raw.vendorCode ?? raw.vendorName ?? '',
    destinationLocationId: pickStr(raw.locationCode),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: toMinorUnits(raw.subTotal),
    totalAmount: toMinorUnits(raw.orderTotal),
    lines: (raw.purchaseOrderLines ?? []).map((l) => ({
      productId: l.productNumber,
      quantityOrdered: l.quantity ?? 0,
      quantityReceived: l.receivedQuantity,
      unitCost: toMinorUnits(l.unitCost),
      lineTotal: toMinorUnits(l.lineTotal),
    })),
    expectedAt: toIso(raw.expectedDeliveryDate),
    orderedAt: toIso(raw.orderDate ?? raw.submitDate),
    receivedAt: toIso(raw.actualDeliveryDate),
    platform: 'crunchtime',
    metadata: strMap({
      orderType: raw.orderType,
      vendorInvoiceNumber: raw.vendorInvoiceNumber,
      invoiceDate: raw.invoiceDate,
      reconcileDate: raw.reconcileDate,
    }),
    raw,
  }
}
