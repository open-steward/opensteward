/**
 * Pipe17 /purchases endpoint -> PurchaseOrder schema.
 *
 * Pipe17 purchase order key fields (camelCase):
 *   purchaseId, poNumber, supplierId, status, currency,
 *   totalAmount, subtotalAmount, destinationLocationId,
 *   lines[].sku, lines[].productId, lines[].quantityOrdered,
 *   lines[].quantityReceived, lines[].unitCost, lines[].lineTotal,
 *   expectedAt, orderedAt, receivedAt, createdAt, updatedAt
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawPipe17PurchaseLine {
  sku?: string
  productId?: string
  quantityOrdered?: number
  quantityReceived?: number
  unitCost?: number
  lineTotal?: number
  [key: string]: unknown
}

export interface RawPipe17Purchase {
  purchaseId?: string
  poNumber?: string
  supplierId?: string
  supplierName?: string
  status?: string
  currency?: string
  totalAmount?: number
  subtotalAmount?: number
  destinationLocationId?: string
  lines?: RawPipe17PurchaseLine[]
  expectedAt?: string
  orderedAt?: string
  receivedAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'sent': case 'open': case 'ordered': case 'submitted': return 'sent'
    case 'partially_received': case 'partiallyreceived': case 'partial': return 'partially_received'
    case 'received': case 'complete': case 'completed': return 'received'
    case 'closed': return 'closed'
    case 'cancelled': case 'canceled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawPipe17Purchase): PurchaseOrder {
  const id = pickStr(raw.purchaseId) ?? ''
  return {
    id,
    externalId: id,
    number: pickStr(raw.poNumber),
    supplierId: pickStr(raw.supplierId) ?? pickStr(raw.supplierName) ?? '',
    destinationLocationId: pickStr(raw.destinationLocationId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: pickNum(raw.subtotalAmount),
    totalAmount: pickNum(raw.totalAmount),
    lines: (Array.isArray(raw.lines) ? raw.lines : []).map((l) => ({
      productId: pickStr(l.productId) ?? pickStr(l.sku) ?? '',
      quantityOrdered: pickNum(l.quantityOrdered) ?? 0,
      quantityReceived: pickNum(l.quantityReceived),
      unitCost: pickNum(l.unitCost),
      lineTotal: pickNum(l.lineTotal),
    })),
    expectedAt: toIso(raw.expectedAt),
    orderedAt: toIso(raw.orderedAt) ?? toIso(raw.createdAt),
    receivedAt: toIso(raw.receivedAt),
    platform: 'pipe17',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
