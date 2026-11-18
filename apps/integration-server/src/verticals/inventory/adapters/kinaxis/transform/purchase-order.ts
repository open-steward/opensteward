/**
 * Kinaxis Maestro PurchaseOrder → PurchaseOrder transform.
 *
 * Maestro exposes supply purchase orders via the PurchaseOrder table.
 * Key fields:
 *   id              — system UUID
 *   orderNumber     — user-visible reference number
 *   supplierId      — references Supplier.id
 *   destinationSiteId — receiving site (references Site.id)
 *   status          — "Draft" | "Open" | "PartiallyReceived" | "Received" | "Closed" | "Cancelled"
 *   currency        — ISO 4217 code
 *   totalValue      — order total in the PO currency (stored as decimal; not minor units)
 *   lines           — array of PurchaseOrderLine objects
 *     partId        — references Part.id
 *     orderedQty    — quantity on order
 *     receivedQty   — quantity received to date
 *     unitPrice     — price per unit in PO currency (decimal)
 *     lineTotal     — orderedQty × unitPrice
 *   orderDate       — ISO-8601 date placed
 *   expectedDate    — ISO-8601 expected delivery date
 *   receivedDate    — ISO-8601 date fully received (null if not yet)
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawKinaxisPurchaseOrder {
  id: string
  orderNumber?: string
  supplierId?: string
  destinationSiteId?: string
  status?: string
  currency?: string
  totalValue?: number
  lines?: Array<{
    partId: string
    orderedQty: number
    receivedQty?: number
    /** Unit price in PO currency. */
    unitPrice?: number
    lineTotal?: number
  }>
  orderDate?: string
  expectedDate?: string
  receivedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'open': case 'ordered': return 'sent'
    case 'partiallyreceived': case 'partially received': return 'partially_received'
    case 'received': return 'received'
    case 'closed': return 'closed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawKinaxisPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.orderNumber),
    supplierId: raw.supplierId ?? '',
    destinationLocationId: pickStr(raw.destinationSiteId),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    totalAmount: raw.totalValue,
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.partId,
      quantityOrdered: l.orderedQty,
      quantityReceived: l.receivedQty,
      unitCost: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    orderedAt: toIso(raw.orderDate),
    expectedAt: toIso(raw.expectedDate),
    receivedAt: toIso(raw.receivedDate),
    platform: 'kinaxis',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
