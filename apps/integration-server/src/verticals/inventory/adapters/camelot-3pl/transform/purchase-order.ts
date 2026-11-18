import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Camelot 3PL / Excalibur WMS — purchase order (Order In) record.
 *
 * Returned by the /orderin endpoint.
 */
export interface RawCamelot3plPurchaseOrder {
  orderId: string
  orderNumber?: string
  vendorId?: string
  vendorName?: string
  status?: string
  currency?: string
  totalAmount?: number
  subtotalAmount?: number
  warehouseId?: string
  lines?: Array<{
    itemId: string
    quantityOrdered: number
    quantityReceived?: number
    unitPrice?: number
    lineTotal?: number
  }>
  orderDate?: string
  expectedDate?: string
  receivedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': case 'PENDING': return 'draft'
    case 'SENT': case 'ORDERED': case 'OPEN': return 'sent'
    case 'PARTIAL': case 'PARTIALLY RECEIVED': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'COMPLETED': case 'CLOSED': return 'closed'
    case 'VOIDED': case 'CANCELLED': case 'CANCELED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawCamelot3plPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.orderId),
    externalId: String(raw.orderId),
    number: pickStr(raw.orderNumber),
    supplierId: String(raw.vendorId ?? raw.vendorName ?? ''),
    destinationLocationId: pickStr(raw.warehouseId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: typeof raw.subtotalAmount === 'number' ? raw.subtotalAmount : undefined,
    totalAmount: typeof raw.totalAmount === 'number' ? raw.totalAmount : undefined,
    lines: (raw.lines ?? []).map((l) => ({
      productId: String(l.itemId),
      quantityOrdered: l.quantityOrdered,
      quantityReceived: l.quantityReceived,
      unitCost: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: toIso(raw.orderDate),
    receivedAt: toIso(raw.receivedDate),
    platform: 'camelot-3pl',
    metadata: strMap({ vendorName: raw.vendorName }),
    raw,
  }
}
