/**
 * Transform an Inventory Planner stock order (purchase order) into the
 * canonical PurchaseOrder schema.
 *
 * Stock Orders API endpoint: GET /api/v1/purchase-orders[/{id}]
 *
 * Inventory Planner uses snake_case field names and stores all timestamps
 * as RFC822 strings (parseable by new Date()).
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawInventoryPlannerPurchaseOrder {
  /** MongoDB ObjectId-like hex string */
  _id: string
  /** Human-readable PO reference / number */
  reference?: string
  po?: string
  /** Vendor identifier */
  vendor?: string
  vendor_id?: string
  /** Destination warehouse */
  warehouse?: string
  warehouse_id?: string
  /** Status string: OPEN, CLOSED, DRAFT, CANCELLED, etc. */
  status?: string
  /** Order type: "po" | "transfer" | "assembly" */
  type?: string
  currency?: string
  total?: number
  subtotal?: number
  /** Line items */
  items?: Array<{
    _id?: string
    variant_id?: string
    sku?: string
    quantity?: number
    received?: number
    cost?: number
    total?: number
  }>
  /** Timestamps */
  expected_date?: string
  ordered_date?: string
  received_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'OPEN': case 'ORDERED': case 'SENT': return 'sent'
    case 'PARTIALLY RECEIVED': case 'PARTIAL': return 'partially_received'
    case 'RECEIVED': return 'received'
    case 'CLOSED': case 'COMPLETED': return 'closed'
    case 'CANCELLED': case 'VOIDED': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawInventoryPlannerPurchaseOrder): PurchaseOrder {
  return {
    id: raw._id,
    externalId: raw._id,
    number: pickStr(raw.reference ?? raw.po),
    supplierId: pickStr(raw.vendor_id ?? raw.vendor) ?? '',
    destinationLocationId: pickStr(raw.warehouse_id ?? raw.warehouse),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: raw.subtotal,
    totalAmount: raw.total,
    lines: (raw.items ?? []).map((item) => ({
      productId: pickStr(item.variant_id ?? item.sku) ?? '',
      quantityOrdered: item.quantity ?? 0,
      quantityReceived: item.received,
      unitCost: item.cost,
      lineTotal: item.total,
    })),
    expectedAt: toIso(raw.expected_date),
    orderedAt: toIso(raw.ordered_date ?? raw.created_at),
    receivedAt: toIso(raw.received_date),
    platform: 'inventory-planner',
    metadata: strMap({ type: raw.type, status: raw.status }),
    raw,
  }
}
