/**
 * Transform Revel Systems PurchaseOrder resource → canonical PurchaseOrder.
 *
 * Endpoint:  GET /resources/PurchaseOrder/
 *
 * Key fields (Revel snake_case):
 *   id, purchase_order_number, vendor (FK int or URI), status,
 *   establishment (FK → destination location),
 *   created_date, expected_delivery_date, completed_date,
 *   purchase_order_items (nested line items)
 *
 * Revel PO statuses: "Draft", "Ordered", "Partially Received",
 *   "Received", "Completed", "Cancelled"
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso, dollarsToMinorUnits} from './shared'

export interface RawRevelPurchaseOrderItem {
  /** PK of the line item. */
  id?: number | string
  /** FK to Ingredient (the item being ordered). */
  ingredient?: number | string | null
  /** Ordered quantity. */
  quantity?: number | string | null
  /** Quantity actually received. */
  received_quantity?: number | string | null
  /** Unit cost in USD. */
  unit_cost?: number | string | null
  /** Line total in USD. */
  total?: number | string | null
  [key: string]: unknown
}

export interface RawRevelPurchaseOrder {
  /** Auto-increment PK. */
  id: number | string
  /** Human-readable PO number (e.g. "PO-0042"). */
  purchase_order_number?: string | null
  /** FK to Vendor. May be integer or resource URI. */
  vendor?: number | string | null
  /** Status string: "Draft", "Ordered", "Partially Received", "Received", "Completed", "Cancelled". */
  status?: string | null
  /** FK to Establishment (destination location). */
  establishment?: number | string | null
  /** ISO-8601 order creation date. */
  created_date?: string
  /** ISO-8601 expected delivery date. */
  expected_delivery_date?: string | null
  /** ISO-8601 date order was completed/closed. */
  completed_date?: string | null
  /** Nested line items. */
  purchase_order_items?: RawRevelPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'ordered': return 'sent'
    case 'partially received': return 'partially_received'
    case 'received': return 'received'
    case 'completed': return 'closed'
    case 'cancelled': return 'cancelled'
    default: return 'draft'
  }
}

function resolveUri(v: number | string | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  const match = /\/(\d+)\/?$/.exec(s)
  return match ? match[1] : s
}

export function transformPurchaseOrder(raw: RawRevelPurchaseOrder): PurchaseOrder {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.purchase_order_number) ?? undefined,
    supplierId: resolveUri(raw.vendor),
    destinationLocationId: resolveUri(raw.establishment) || undefined,
    status: mapStatus(raw.status),
    currency: 'USD',
    // Revel returns dollar floats; canonical PO schema amounts are integer minor units (cents)
    lines: (raw.purchase_order_items ?? []).map((l) => {
      const unitCostDollars = pickNum(l.unit_cost)
      const lineTotalDollars = pickNum(l.total)
      return {
        productId: resolveUri(l.ingredient),
        quantityOrdered: pickNum(l.quantity) ?? 0,
        quantityReceived: pickNum(l.received_quantity),
        unitCost: unitCostDollars !== undefined ? dollarsToMinorUnits(unitCostDollars) : undefined,
        lineTotal: lineTotalDollars !== undefined ? dollarsToMinorUnits(lineTotalDollars) : undefined,
      }
    }),
    orderedAt: toIso(raw.created_date),
    expectedAt: toIso(raw.expected_delivery_date) ?? undefined,
    receivedAt: toIso(raw.completed_date) ?? undefined,
    platform: 'revel-systems',
    metadata: strMap({ rawStatus: raw.status }),
    raw,
  }
}
