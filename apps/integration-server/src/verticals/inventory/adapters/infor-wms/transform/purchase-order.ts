/**
 * Transform Infor WMS purchase order (receipt / inbound order) records.
 *
 * Infor WMS purchase orders are called "Receipts" or "PO Headers" in the
 * warehouse module. They are available at /WMS/purchaseorders.
 * Key fields:
 *   purchaseOrderNumber — external PO number / reference
 *   receiptId           — internal WMS receipt identifier
 *   supplierId          — vendor identifier
 *   warehouseId         — destination warehouse
 *   status              — OPEN | IN_PROGRESS | RECEIVED | CLOSED | CANCELLED
 *   currencyCode        — transaction currency
 *   totalOrderedQty     — total quantity ordered
 *   totalReceivedQty    — total quantity received to date
 *   expectedDate        — expected arrival date
 *   orderedDate         — date PO was raised
 *   completedDate       — date fully received / closed
 *   lines               — PO line array
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawInforWmsPurchaseOrderLine {
  lineNumber?: number | string
  itemNumber: string
  orderedQty?: number | string
  receivedQty?: number | string
  unitCost?: number | string
  lineTotal?: number | string
  uom?: string
  [key: string]: unknown
}

export interface RawInforWmsPurchaseOrder {
  receiptId: string
  purchaseOrderNumber?: string
  supplierId?: string
  warehouseId?: string
  status?: string
  currencyCode?: string
  totalOrderedValue?: number | string
  subtotalValue?: number | string
  expectedDate?: string
  orderedDate?: string
  completedDate?: string
  lines?: RawInforWmsPurchaseOrderLine[]
  ownerCode?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN': case 'PENDING': case 'DRAFT': return 'draft'
    case 'IN_PROGRESS': case 'PROCESSING': case 'ORDERED': return 'sent'
    case 'PARTIALLY_RECEIVED': case 'PARTIAL': return 'partially_received'
    case 'RECEIVED': case 'COMPLETE': return 'received'
    case 'CLOSED': return 'closed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawInforWmsPurchaseOrder): PurchaseOrder {
  return {
    id: raw.receiptId,
    externalId: raw.receiptId,
    number: pickStr(raw.purchaseOrderNumber),
    supplierId: raw.supplierId ?? '',
    destinationLocationId: pickStr(raw.warehouseId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currencyCode),
    subtotalAmount: pickNum(raw.subtotalValue),
    totalAmount: pickNum(raw.totalOrderedValue),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemNumber,
      quantityOrdered: pickNum(l.orderedQty) ?? 0,
      quantityReceived: pickNum(l.receivedQty),
      unitCost: pickNum(l.unitCost),
      lineTotal: pickNum(l.lineTotal),
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: toIso(raw.orderedDate),
    receivedAt: toIso(raw.completedDate),
    platform: 'infor-wms',
    metadata: strMap({
      ownerCode: raw.ownerCode,
      warehouseId: raw.warehouseId,
    }),
    raw,
  }
}
