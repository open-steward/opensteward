/**
 * Transform Texada CloudLink purchase order records into the canonical
 * PurchaseOrder schema.
 *
 * Texada purchase orders represent equipment or parts procurement from
 * vendors. Field names follow Texada CloudLink camelCase JSON conventions.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso, dollarsToMinorUnits} from './shared'

export interface RawTexadaPurchaseOrder {
  /** PO internal identifier */
  purchaseOrderId?: string
  poId?: string
  id?: string
  /** PO number shown on documents */
  purchaseOrderNo?: string
  poNumber?: string
  orderNo?: string
  /** Vendor/supplier reference */
  vendorId?: string
  vendorNo?: string
  vendorName?: string
  /** Destination branch/depot */
  branchId?: string
  branchNo?: string
  destinationBranch?: string
  /** Order lifecycle status */
  status?: string
  orderStatus?: string
  /** Currency */
  currency?: string
  currencyCode?: string
  /** Monetary totals (decimal dollars from Texada; converted to minor units in transform) */
  subTotal?: number
  subtotalAmount?: number
  totalAmount?: number
  orderTotal?: number
  /** Line items */
  lines?: Array<{
    itemNo?: string
    productId?: string
    quantity?: number
    quantityOrdered?: number
    quantityReceived?: number
    received?: number
    unitCost?: number
    unitPrice?: number
    lineTotal?: number
    total?: number
  }>
  /** Dates */
  orderDate?: string
  createdDate?: string
  expectedDeliveryDate?: string
  dueDate?: string
  receivedDate?: string
  completedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'NEW': return 'draft'
    case 'ORDERED': case 'SENT': case 'APPROVED': case 'OPEN': return 'sent'
    case 'PARTIAL': case 'PARTIALLY RECEIVED': case 'PARTIALLYRECEIVED': return 'partially_received'
    case 'RECEIVED': case 'FULLY RECEIVED': return 'received'
    case 'COMPLETED': case 'CLOSED': case 'INVOICED': return 'closed'
    case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawTexadaPurchaseOrder): PurchaseOrder {
  const id = pickStr(raw.purchaseOrderId ?? raw.poId ?? raw.id) ?? ''
  const number = pickStr(raw.purchaseOrderNo ?? raw.poNumber ?? raw.orderNo)
  const supplierId = pickStr(raw.vendorId ?? raw.vendorNo) ?? ''
  const destinationLocationId = pickStr(raw.branchId ?? raw.branchNo ?? raw.destinationBranch)
  const status = mapStatus(raw.status ?? raw.orderStatus)
  const currency = pickStr(raw.currency ?? raw.currencyCode)
  const subtotalRaw = pickNum(raw.subTotal ?? raw.subtotalAmount)
  const totalRaw = pickNum(raw.totalAmount ?? raw.orderTotal)
  // Texada reports monetary values in decimal dollars; canonical schema requires integer minor units (cents).
  const subtotalAmount = subtotalRaw !== undefined ? dollarsToMinorUnits(subtotalRaw) : undefined
  const totalAmount = totalRaw !== undefined ? dollarsToMinorUnits(totalRaw) : undefined

  const lines = (raw.lines ?? []).map((l) => {
    const unitCostRaw = pickNum(l.unitCost ?? l.unitPrice)
    const lineTotalRaw = pickNum(l.lineTotal ?? l.total)
    return {
      productId: pickStr(l.itemNo ?? l.productId) ?? '',
      quantityOrdered: pickNum(l.quantity ?? l.quantityOrdered) ?? 0,
      quantityReceived: pickNum(l.quantityReceived ?? l.received),
      unitCost: unitCostRaw !== undefined ? dollarsToMinorUnits(unitCostRaw) : undefined,
      lineTotal: lineTotalRaw !== undefined ? dollarsToMinorUnits(lineTotalRaw) : undefined,
    }
  })

  return {
    id,
    externalId: id,
    number,
    supplierId,
    destinationLocationId,
    status,
    currency,
    subtotalAmount,
    totalAmount,
    lines,
    expectedAt: toIso(raw.expectedDeliveryDate ?? raw.dueDate),
    orderedAt: toIso(raw.orderDate ?? raw.createdDate),
    receivedAt: toIso(raw.receivedDate ?? raw.completedDate),
    platform: 'texada',
    metadata: strMap({ vendorName: raw.vendorName }),
    raw,
  }
}
