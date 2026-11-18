/**
 * Manhattan Active WM — purchase order (inbound receipt) transform.
 *
 * WM REST endpoint:
 *   GET /wm/v1/purchase-orders
 *   GET /wm/v1/purchase-orders/{purchaseOrderId}
 *
 * Manhattan Active WM calls these Purchase Orders (POs) / Inbound Receipts.
 * A PO drives the receiving process in the warehouse.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawManhattanActivePurchaseOrder {
  purchaseOrderId: string
  purchaseOrderNumber?: string
  supplierId?: string
  supplierName?: string
  status?: string
  currency?: string
  totalAmount?: number
  subtotalAmount?: number
  /** Destination facility/warehouse. */
  facilityId?: string
  lines?: Array<{
    itemId: string
    itemNumber?: string
    quantityOrdered: number
    quantityReceived?: number
    unitCost?: number
    lineTotal?: number
  }>
  orderDate?: string
  expectedDeliveryDate?: string
  receivedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'CREATED': return 'draft'
    case 'SENT': case 'SUBMITTED': case 'APPROVED': return 'sent'
    case 'PARTIALLY_RECEIVED': case 'PARTIAL': return 'partially_received'
    case 'RECEIVED': case 'COMPLETED': return 'received'
    case 'CLOSED': return 'closed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawManhattanActivePurchaseOrder): PurchaseOrder {
  return {
    id: raw.purchaseOrderId,
    externalId: raw.purchaseOrderId,
    number: pickStr(raw.purchaseOrderNumber),
    supplierId: pickStr(raw.supplierId) ?? '',
    destinationLocationId: pickStr(raw.facilityId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: pickNum(raw.subtotalAmount),
    totalAmount: pickNum(raw.totalAmount),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId,
      quantityOrdered: l.quantityOrdered,
      quantityReceived: l.quantityReceived,
      unitCost: l.unitCost,
      lineTotal: l.lineTotal,
    })),
    orderedAt: toIso(raw.orderDate),
    expectedAt: toIso(raw.expectedDeliveryDate),
    receivedAt: toIso(raw.receivedDate),
    platform: 'manhattan-active',
    metadata: strMap({ supplierName: raw.supplierName, facilityId: raw.facilityId }),
    raw,
  }
}
