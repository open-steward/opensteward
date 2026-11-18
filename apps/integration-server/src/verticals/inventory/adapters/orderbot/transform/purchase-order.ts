/**
 * Orderbot purchase-order transform.
 *
 * Orderbot supports purchase orders as part of its inbound supply-chain
 * workflow.  Field names follow the snake_case REST convention.
 *
 * Currency amounts: unit_cost and line_total are stored as-is from the API
 * (decimal dollars) in the PurchaseOrder line schema.  The schema's
 * `totalAmount` / `subtotalAmount` fields hold display-currency amounts, not
 * minor integer units, per the inventory vertical convention.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

export interface RawOrderbotPurchaseOrderLine {
  product_id?: string | number
  sku?: string
  quantity_ordered?: number | string
  quantity_received?: number | string
  unit_cost?: number | string
  line_total?: number | string
  [key: string]: unknown
}

export interface RawOrderbotPurchaseOrder {
  id?: string | number
  number?: string
  po_number?: string
  supplier_id?: string | number
  supplier?: string
  destination_location_id?: string | number
  status?: string
  currency?: string
  subtotal?: number | string
  total?: number | string
  lines?: RawOrderbotPurchaseOrderLine[]
  line_items?: RawOrderbotPurchaseOrderLine[]
  expected_delivery_date?: string
  expected_at?: string
  ordered_at?: string
  received_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase().replace(/[_\s-]/g, '')) {
    case 'draft':
      return 'draft'
    case 'sent':
    case 'ordered':
    case 'approved':
    case 'authorised':
      return 'sent'
    case 'partiallyreceived':
    case 'partial':
      return 'partially_received'
    case 'received':
    case 'fullyreceived':
      return 'received'
    case 'closed':
    case 'completed':
      return 'closed'
    case 'cancelled':
    case 'voided':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawOrderbotPurchaseOrder): PurchaseOrder {
  const id = String(raw.id ?? '')
  const rawLines = raw.lines ?? raw.line_items ?? []
  return {
    id,
    externalId: id,
    number: pickStr(raw.number) ?? pickStr(raw.po_number),
    supplierId: String(raw.supplier_id ?? raw.supplier ?? ''),
    destinationLocationId:
      raw.destination_location_id !== undefined ? String(raw.destination_location_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: pickNum(raw.subtotal),
    totalAmount: pickNum(raw.total),
    lines: rawLines.map((l) => ({
      productId: String(l.product_id ?? l.sku ?? ''),
      quantityOrdered: pickNum(l.quantity_ordered) ?? 0,
      quantityReceived: pickNum(l.quantity_received),
      unitCost: pickNum(l.unit_cost),
      lineTotal: pickNum(l.line_total),
    })),
    expectedAt: toIso(raw.expected_delivery_date) ?? toIso(raw.expected_at),
    orderedAt: toIso(raw.ordered_at) ?? toIso(raw.created_at),
    receivedAt: toIso(raw.received_at),
    platform: 'orderbot',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
