/**
 * Jubelio purchase-order transform.
 *
 * GET /purchase/orders/      → {data: RawJubelioPurchaseOrder[], count: number}
 * GET /purchase/orders/{id}  → RawJubelioPurchaseOrder
 *
 * Jubelio PO fields sourced from the purchase API documentation.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawJubelioPurchaseOrder {
  purchaseorder_id: number | string
  purchaseorder_no?: string
  vendor_id?: number | string
  vendor_name?: string
  location_id?: number | string
  status?: string
  currency?: string
  subtotal?: number | string
  grand_total?: number | string
  order_date?: string
  expected_date?: string
  receive_date?: string
  items?: Array<{
    item_id: number | string
    qty?: number | string
    qty_received?: number | string
    unit_price?: number | string
    total?: number | string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'ordered':
    case 'open': return 'sent'
    case 'partial': return 'partially_received'
    case 'received':
    case 'closed': return 'received'
    case 'completed': return 'closed'
    case 'cancelled':
    case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawJubelioPurchaseOrder): PurchaseOrder {
  const id = String(raw.purchaseorder_id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.purchaseorder_no),
    supplierId: raw.vendor_id != null ? String(raw.vendor_id) : (pickStr(raw.vendor_name) ?? ''),
    destinationLocationId: raw.location_id != null ? String(raw.location_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency) ?? 'IDR',
    subtotalAmount: pickNum(raw.subtotal),
    totalAmount: pickNum(raw.grand_total),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.item_id),
      quantityOrdered: pickNum(l.qty) ?? 0,
      quantityReceived: pickNum(l.qty_received),
      unitCost: pickNum(l.unit_price),
      lineTotal: pickNum(l.total),
    })),
    expectedAt: toIso(raw.expected_date),
    orderedAt: toIso(raw.order_date),
    receivedAt: toIso(raw.receive_date),
    platform: 'jubelio',
    metadata: strMap({ vendorName: raw.vendor_name }),
    raw,
  }
}
