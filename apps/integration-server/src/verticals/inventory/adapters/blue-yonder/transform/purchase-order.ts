/**
 * Transform a Blue Yonder WMS Receipt to the canonical PurchaseOrder.
 *
 * Source: GET /wms/v1/receipts  — Receipt schema
 *   receiptId, referenceNumber, status (Expected|Arrived|InProgress|Completed|Cancelled),
 *   expectedDate, arrivedDate, supplierId, supplierName, lineItems[]
 *     lineItem: lineId, itemId, itemDescription, expectedQuantity, receivedQuantity, unitOfMeasure
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawBlueYonderReceiptLineItem {
  lineId?: string
  itemId: string
  itemDescription?: string
  expectedQuantity?: number
  receivedQuantity?: number
  unitOfMeasure?: string
  [key: string]: unknown
}

export interface RawBlueYonderReceipt {
  receiptId: string
  referenceNumber?: string
  status?: string
  expectedDate?: string
  arrivedDate?: string
  supplierId?: string
  supplierName?: string
  lineItems?: RawBlueYonderReceiptLineItem[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'expected': return 'sent'
    case 'arrived': case 'inprogress': return 'partially_received'
    case 'completed': return 'received'
    case 'cancelled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawBlueYonderReceipt): PurchaseOrder {
  return {
    id: raw.receiptId,
    externalId: raw.receiptId,
    number: pickStr(raw.referenceNumber),
    supplierId: pickStr(raw.supplierId) ?? '',
    destinationLocationId: undefined,
    status: mapStatus(raw.status),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines: (raw.lineItems ?? []).map((l) => ({
      productId: l.itemId,
      quantityOrdered: pickNum(l.expectedQuantity) ?? 0,
      quantityReceived: pickNum(l.receivedQuantity),
      unitCost: undefined,
      lineTotal: undefined,
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: undefined,
    receivedAt: toIso(raw.arrivedDate),
    platform: 'blue-yonder',
    metadata: strMap({ supplierName: raw.supplierName, status: raw.status }),
    raw,
  }
}
