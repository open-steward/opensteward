import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Sumtracker purchase order object as returned by GET /purchase_orders
 * or GET /purchase_orders/:id.
 * Line items nested under `items` array.
 */
export interface RawSumtrackerPurchaseOrder {
  id: string | number
  po_number?: string
  supplier_id?: string | number
  warehouse_id?: string | number
  status?: string
  currency?: string
  subtotal?: number | string
  total?: number | string
  items?: Array<{
    product_id: string | number
    quantity: number | string
    received_qty?: number | string
    unit_cost?: number | string
    line_total?: number | string
  }>
  order_date?: string
  expected_date?: string
  received_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'ordered': case 'sent': case 'submitted': return 'sent'
    case 'partially received': case 'partial': return 'partially_received'
    case 'received': return 'received'
    case 'completed': case 'closed': return 'closed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSumtrackerPurchaseOrder): PurchaseOrder {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.po_number),
    supplierId: raw.supplier_id !== undefined ? String(raw.supplier_id) : '',
    destinationLocationId: raw.warehouse_id !== undefined ? String(raw.warehouse_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: pickNum(raw.subtotal),
    totalAmount: pickNum(raw.total),
    lines: (raw.items ?? []).map((l) => ({
      productId: String(l.product_id),
      quantityOrdered: pickNum(l.quantity) ?? 0,
      quantityReceived: pickNum(l.received_qty),
      unitCost: pickNum(l.unit_cost),
      lineTotal: pickNum(l.line_total),
    })),
    expectedAt: toIso(raw.expected_date),
    orderedAt: toIso(raw.order_date),
    receivedAt: toIso(raw.received_date),
    platform: 'sumtracker',
    metadata: strMap({}),
    raw,
  }
}
