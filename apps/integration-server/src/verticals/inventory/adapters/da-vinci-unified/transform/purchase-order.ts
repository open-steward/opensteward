/**
 * Da Vinci Unified — purchase order (receipt header) transform.
 *
 * DVU receipt orders are the inbound PO equivalent. API endpoint:
 * /api/receipt/receiptHeaders. Key fields: receiptId, receiptNumber,
 * vendorId, status, currencyCode, totalAmount, warehouseId,
 * lines[].itemId, lines[].quantityOrdered, lines[].quantityReceived,
 * lines[].unitCost, lines[].lineTotal,
 * expectedDate, orderDate, receivedDate.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawDaVinciUnifiedPurchaseOrder {
  receiptId: string
  receiptNumber?: string
  vendorId?: string
  status?: string
  currencyCode?: string
  totalAmount?: number
  subtotalAmount?: number
  warehouseId?: string
  lines?: Array<{
    itemId: string
    quantityOrdered: number
    quantityReceived?: number
    unitCost?: number
    lineTotal?: number
  }>
  orderDate?: string
  expectedDate?: string
  receivedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'OPEN':
      return 'draft'
    case 'SUBMITTED':
    case 'SENT':
      return 'sent'
    case 'PARTIAL':
    case 'PARTIALLY RECEIVED':
      return 'partially_received'
    case 'RECEIVED':
      return 'received'
    case 'COMPLETED':
    case 'CLOSED':
      return 'closed'
    case 'VOIDED':
    case 'CANCELLED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawDaVinciUnifiedPurchaseOrder): PurchaseOrder {
  return {
    id: raw.receiptId,
    externalId: raw.receiptId,
    number: pickStr(raw.receiptNumber),
    supplierId: raw.vendorId ?? '',
    destinationLocationId: pickStr(raw.warehouseId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currencyCode),
    subtotalAmount: raw.subtotalAmount,
    totalAmount: raw.totalAmount,
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemId,
      quantityOrdered: l.quantityOrdered,
      quantityReceived: l.quantityReceived,
      unitCost: l.unitCost,
      lineTotal: l.lineTotal,
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: toIso(raw.orderDate),
    receivedAt: toIso(raw.receivedDate),
    platform: 'da-vinci-unified',
    metadata: strMap({}),
    raw,
  }
}
