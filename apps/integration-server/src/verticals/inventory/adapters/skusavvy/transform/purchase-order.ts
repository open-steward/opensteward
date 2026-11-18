import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * SKUSavvy GraphQL purchase order node.
 * Fields follow SKUSavvy camelCase GraphQL conventions.
 * Monetary amounts arrive as decimal dollars; we convert to integer cents.
 */
export interface RawSkusavvyPurchaseOrder {
  id: string
  number?: string
  vendorId?: string
  status?: string
  currency?: string
  subtotal?: number
  total?: number
  locationId?: string
  lineItems?: Array<{
    id: string
    productId: string
    quantity: number
    quantityReceived?: number
    unitCost?: number
    lineTotal?: number
  }>
  orderedAt?: string
  expectedAt?: string
  receivedAt?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'pending': return 'draft'
    case 'ordered': case 'submitted': case 'open': return 'sent'
    case 'partial': case 'partially_received': return 'partially_received'
    case 'received': return 'received'
    case 'complete': case 'completed': case 'closed': return 'closed'
    case 'voided': case 'cancelled': case 'canceled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSkusavvyPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.number),
    supplierId: raw.vendorId ?? '',
    destinationLocationId: pickStr(raw.locationId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    // convert decimal dollars to integer cents
    subtotalAmount: raw.subtotal !== undefined ? Math.round(raw.subtotal * 100) : undefined,
    totalAmount: raw.total !== undefined ? Math.round(raw.total * 100) : undefined,
    lines: (raw.lineItems ?? []).map((l) => ({
      productId: l.productId,
      quantityOrdered: l.quantity,
      quantityReceived: l.quantityReceived,
      unitCost: l.unitCost !== undefined ? Math.round(l.unitCost * 100) : undefined,
      lineTotal: l.lineTotal !== undefined ? Math.round(l.lineTotal * 100) : undefined,
    })),
    orderedAt: toIso(raw.orderedAt),
    expectedAt: toIso(raw.expectedAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'skusavvy',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
