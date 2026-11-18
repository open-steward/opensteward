/**
 * Transform a Deposco WMS purchase order (inbound order) into the canonical PurchaseOrder shape.
 *
 * Endpoint: GET /orders/Purchase%20Order  or  GET /orders/Purchase%20Order/{orderNumber}
 *
 * Field notes:
 *   orderNumber       — primary key (external PO number)
 *   vendorNumber      — supplier/vendor ID
 *   vendorName        — supplier display name
 *   status            — OPEN | CLOSED | CANCELLED | RECEIVED | PARTIAL
 *   currency          — transaction currency
 *   facilityNumber    — destination facility/warehouse
 *   lines[].itemNumber        — product SKU
 *   lines[].quantityOrdered   — qty ordered
 *   lines[].quantityReceived  — qty received to date
 *   lines[].unitCost          — per-unit cost
 *   lines[].lineTotal         — total for line
 *   expectedDate      — ISO expected delivery date
 *   orderDate         — ISO order creation date
 *   completedDate     — ISO date fully received/closed
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawDeposcoPurchaseOrder {
  orderNumber: string
  vendorNumber?: string
  vendorName?: string
  status?: string
  currency?: string
  facilityNumber?: string
  lines?: Array<{
    itemNumber: string
    quantityOrdered: number | string
    quantityReceived?: number | string
    unitCost?: number | string
    lineTotal?: number | string
  }>
  expectedDate?: string
  orderDate?: string
  completedDate?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'OPEN': return 'sent'
    case 'PARTIAL': case 'PARTIALLY RECEIVED': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'CLOSED': case 'COMPLETED': return 'closed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawDeposcoPurchaseOrder): PurchaseOrder {
  return {
    id: raw.orderNumber,
    externalId: raw.orderNumber,
    number: raw.orderNumber,
    supplierId: raw.vendorNumber ?? '',
    destinationLocationId: pickStr(raw.facilityNumber),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.itemNumber,
      quantityOrdered: pickNum(l.quantityOrdered) ?? 0,
      quantityReceived: pickNum(l.quantityReceived),
      unitCost: pickNum(l.unitCost),
      lineTotal: pickNum(l.lineTotal),
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: toIso(raw.orderDate),
    receivedAt: toIso(raw.completedDate),
    platform: 'deposco',
    metadata: strMap({ vendorName: raw.vendorName }),
    raw,
  }
}
