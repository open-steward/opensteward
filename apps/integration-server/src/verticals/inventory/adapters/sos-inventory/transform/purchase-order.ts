/**
 * SOS Inventory v2 purchase order transform.
 *
 * The public v2 REST API does not include a purchase order list endpoint.
 * Purchase order data is available inside SOS Inventory's web UI but is not
 * surfaced through GET /api/v2/purchaseorder in the documented public API.
 *
 * This module is retained for structural parity; the adapter index does NOT
 * implement listPurchaseOrders / getPurchaseOrder.
 *
 * Field mapping (from SOS v8 help docs and UI field descriptions):
 *   id          — internal PO id (integer)
 *   number      — "PO number" reference string
 *   vendor      — { id, name }
 *   location    — { id, name } destination
 *   status      — open / closed
 *   currency    — currency code
 *   total       — order total (float, major units)
 *   subTotal    — subtotal before tax/shipping
 *   date        — created date
 *   expectedDate — expected delivery date
 *   lines[]     — { item.{id,name}, quantity, received, unitprice, amount }
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawSosInventoryPurchaseOrder {
  id: number | string
  number?: string
  vendor?: { id?: number | string; name?: string }
  location?: { id?: number | string; name?: string }
  status?: string
  currency?: string
  total?: number
  subTotal?: number
  date?: string
  expectedDate?: string
  lines?: Array<{
    item?: { id?: number | string; name?: string }
    quantity?: number
    received?: number
    unitprice?: number
    amount?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'open': case 'ordered': return 'sent'
    case 'partially received': return 'partially_received'
    case 'received': return 'received'
    case 'closed': return 'closed'
    case 'voided': case 'cancelled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSosInventoryPurchaseOrder): PurchaseOrder {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    supplierId: raw.vendor?.id !== undefined ? String(raw.vendor.id) : '',
    destinationLocationId: raw.location?.id !== undefined ? String(raw.location.id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: raw.subTotal,
    totalAmount: raw.total,
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.item?.id !== undefined ? String(l.item.id) : '',
      quantityOrdered: l.quantity ?? 0,
      quantityReceived: l.received,
      unitCost: l.unitprice,
      lineTotal: l.amount,
    })),
    expectedAt: toIso(raw.expectedDate),
    orderedAt: toIso(raw.date),
    receivedAt: undefined,
    platform: 'sos-inventory',
    metadata: strMap({}),
    raw,
  }
}
