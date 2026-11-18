/**
 * TrueCommerce purchase-order transform.
 *
 * Maps GET /v1/purchase-orders response fields:
 *   po_id, po_number, supplier_id, status, currency,
 *   subtotal_amount, total_amount (both in MINOR UNITS / cents),
 *   destination_location_id, line_items, ordered_date,
 *   expected_delivery_date, received_date
 *
 * Amounts: subtotal_amount and total_amount are in INTEGER MINOR UNITS.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawTruecommercePurchaseOrderLine {
  item_id: string
  qty_ordered: number
  qty_received?: number
  /** Unit cost in minor units (cents). */
  unit_cost?: number
  /** Line total in minor units (cents). */
  line_total?: number
}

export interface RawTruecommercePurchaseOrder {
  po_id: string
  po_number?: string
  supplier_id?: string
  status?: string
  currency?: string
  /** Subtotal in minor units (cents). */
  subtotal_amount?: number
  /** Total in minor units (cents). */
  total_amount?: number
  destination_location_id?: string
  line_items?: RawTruecommercePurchaseOrderLine[]
  ordered_date?: string
  expected_delivery_date?: string
  received_date?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'sent':
    case 'ordered':
    case 'submitted': return 'sent'
    case 'partially_received':
    case 'partially received': return 'partially_received'
    case 'received': return 'received'
    case 'closed':
    case 'completed': return 'closed'
    case 'cancelled':
    case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawTruecommercePurchaseOrder): PurchaseOrder {
  return {
    id: raw.po_id,
    externalId: raw.po_id,
    number: pickStr(raw.po_number),
    supplierId: raw.supplier_id ?? '',
    destinationLocationId: pickStr(raw.destination_location_id),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    // Already in minor units
    subtotalAmount: raw.subtotal_amount,
    totalAmount: raw.total_amount,
    lines: (raw.line_items ?? []).map((l) => ({
      productId: l.item_id,
      quantityOrdered: l.qty_ordered,
      quantityReceived: l.qty_received,
      unitCost: l.unit_cost,
      lineTotal: l.line_total,
    })),
    orderedAt: toIso(raw.ordered_date),
    expectedAt: toIso(raw.expected_delivery_date),
    receivedAt: toIso(raw.received_date),
    platform: 'truecommerce',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
