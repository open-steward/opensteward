/**
 * Transform Boxstorm purchase order → canonical PurchaseOrder.
 *
 * Boxstorm (Fishbowl Advanced) purchase orders endpoint: GET /api/purchase-orders
 * Response envelope: { totalCount, totalPages, pageNumber, pageSize, results: RawBoxstormPurchaseOrder[] }
 * Single record: GET /api/purchase-orders/:id → RawBoxstormPurchaseOrder (no envelope)
 *
 * PO line items are in the poItems array.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawBoxstormPOItem {
  id?: number | string
  /** Part sub-object */
  part?: { id?: number | string; name?: string; description?: string }
  lineNumber?: number
  vendorPartNumber?: string
  quantity?: number
  quantityFulfilled?: number
  quantityPicked?: number
  unitCost?: number | string
  totalCost?: number | string
  dateScheduledFulfillment?: string
  status?: string
  uom?: { id?: number | string; name?: string; abbreviation?: string }
  note?: string
  [key: string]: unknown
}

export interface RawBoxstormPurchaseOrder {
  /** Numeric primary key */
  id: number | string
  number?: string
  status?: string
  /** Vendor sub-object */
  vendor?: { id?: number | string; name?: string }
  /** Currency code */
  currency?: string
  totalTax?: number | string
  /** Date strings (ISO-8601) */
  dateCreated?: string
  dateConfirmed?: string
  dateScheduled?: string
  dateCompleted?: string
  lastModified?: string
  /** Shipping destination address */
  shipToAddress?: {
    name?: string
    street?: string
    city?: string
    state?: string
    country?: string
    zip?: string
  }
  /** Line items */
  poItems?: RawBoxstormPOItem[]
  note?: string
  locationGroup?: { id?: number | string; name?: string }
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'issued': return 'sent'
    case 'partial': case 'partially fulfilled': return 'partially_received'
    case 'fulfilled': return 'received'
    case 'closed': return 'closed'
    case 'void': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawBoxstormPurchaseOrder): PurchaseOrder {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    supplierId: raw.vendor ? String(raw.vendor.id ?? raw.vendor.name ?? '') : '',
    destinationLocationId: raw.locationGroup ? String(raw.locationGroup.id ?? raw.locationGroup.name ?? '') : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    lines: (raw.poItems ?? []).map((l) => ({
      productId: l.part ? String(l.part.id ?? '') : '',
      quantityOrdered: l.quantity ?? 0,
      quantityReceived: l.quantityFulfilled,
      unitCost: typeof l.unitCost === 'string' ? parseFloat(l.unitCost) || undefined : l.unitCost,
      lineTotal: typeof l.totalCost === 'string' ? parseFloat(l.totalCost) || undefined : l.totalCost,
    })),
    orderedAt: toIso(raw.dateConfirmed),
    expectedAt: toIso(raw.dateScheduled),
    receivedAt: toIso(raw.dateCompleted),
    platform: 'boxstorm',
    metadata: strMap({
      dateCreated: raw.dateCreated,
      lastModified: raw.lastModified,
      note: raw.note,
    }),
    raw,
  }
}
