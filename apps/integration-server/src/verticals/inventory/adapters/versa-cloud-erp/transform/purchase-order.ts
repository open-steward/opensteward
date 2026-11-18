/**
 * Versa Cloud ERP — purchase order transform.
 *
 * API endpoint: GET /order.json?order_type_id=1
 * Key response fields:
 *   id, order_number, supplier (vendor id), supplier_name,
 *   status, currency, subtotal, total,
 *   location_id (destination),
 *   order_items: [{ id, item_id, quantity, quantity_received, per_unit_cost, total }]
 *   order_date, expected_delivery_date, completed_date
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawVersaPurchaseOrderLine {
  id?: string | number
  item_id: string | number
  quantity: number | string
  quantity_received?: number | string
  per_unit_cost?: number | string
  total?: number | string
  [key: string]: unknown
}

export interface RawVersaPurchaseOrder {
  id: string | number
  order_number?: string
  /** vendor/supplier id */
  supplier?: string | number
  supplier_name?: string
  status?: string
  currency?: string
  subtotal?: number | string
  total?: number | string
  location_id?: string | number | null
  order_items?: RawVersaPurchaseOrderLine[]
  order_date?: string
  expected_delivery_date?: string
  completed_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
    case 'open':
      return 'draft'
    case 'sent':
    case 'ordered':
    case 'authorised':
      return 'sent'
    case 'partially received':
    case 'partial':
      return 'partially_received'
    case 'received':
      return 'received'
    case 'completed':
    case 'closed':
      return 'closed'
    case 'voided':
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawVersaPurchaseOrder): PurchaseOrder {
  const id = String(raw.id)

  // Versa stores monetary values as decimal; convert to integer minor units (cents)
  const subtotal = pickNum(raw.subtotal)
  const total = pickNum(raw.total)

  return {
    id,
    externalId: id,
    number: pickStr(raw.order_number),
    supplierId: raw.supplier != null ? String(raw.supplier) : '',
    destinationLocationId:
      raw.location_id != null ? String(raw.location_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: subtotal !== undefined ? Math.round(subtotal * 100) : undefined,
    totalAmount: total !== undefined ? Math.round(total * 100) : undefined,
    lines: (raw.order_items ?? []).map((l) => ({
      productId: String(l.item_id),
      quantityOrdered: Number(l.quantity) || 0,
      quantityReceived:
        l.quantity_received !== undefined ? Number(l.quantity_received) : undefined,
      unitCost:
        l.per_unit_cost !== undefined
          ? Math.round((pickNum(l.per_unit_cost) ?? 0) * 100)
          : undefined,
      lineTotal:
        l.total !== undefined
          ? Math.round((pickNum(l.total) ?? 0) * 100)
          : undefined,
    })),
    orderedAt: toIso(raw.order_date),
    expectedAt: toIso(raw.expected_delivery_date),
    receivedAt: toIso(raw.completed_date),
    platform: 'versa-cloud-erp',
    metadata: strMap({ supplier_name: raw.supplier_name }),
    raw,
  }
}
