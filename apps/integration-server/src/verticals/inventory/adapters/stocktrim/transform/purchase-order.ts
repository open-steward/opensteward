import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/** Shape returned by GET /api/V2/PurchaseOrders */
export interface RawStockTrimPurchaseOrder {
  referenceNumber?: string
  externalId?: string
  clientReferenceNumber?: string
  orderDate?: string
  createdDate?: string
  fullyReceivedDate?: string
  status?: string
  supplier?: { code?: string; name?: string }
  location?: { code?: string; name?: string }
  purchaseOrderLineItems?: Array<{
    productId: string
    quantity: number
    receivedDate?: string
    unitPrice?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'APPROVED': return 'draft'
    case 'SENT': return 'sent'
    case 'RECEIVED': return 'received'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawStockTrimPurchaseOrder): PurchaseOrder {
  // Use referenceNumber as canonical ID; fall back to externalId
  const id = raw.referenceNumber ?? raw.externalId ?? ''

  const lines = (raw.purchaseOrderLineItems ?? []).map((l) => {
    // unitPrice is a float — store as integer minor units (cents)
    const unitCostMinor = l.unitPrice !== undefined ? Math.round(l.unitPrice * 100) : undefined
    return {
      productId: l.productId,
      quantityOrdered: l.quantity,
      unitCost: unitCostMinor,
    }
  })

  return {
    id,
    externalId: raw.externalId ?? id,
    number: pickStr(raw.referenceNumber),
    supplierId: raw.supplier?.code ?? raw.supplier?.name ?? '',
    destinationLocationId: raw.location?.code ?? raw.location?.name,
    status: mapStatus(raw.status),
    lines,
    orderedAt: toIso(raw.orderDate ?? raw.createdDate),
    receivedAt: toIso(raw.fullyReceivedDate),
    platform: 'stocktrim',
    metadata: strMap({ clientReferenceNumber: raw.clientReferenceNumber }),
    raw,
  }
}
