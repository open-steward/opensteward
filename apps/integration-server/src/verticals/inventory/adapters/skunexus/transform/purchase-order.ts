import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw purchase order record from the SkuNexus REST API.
 * Endpoint: GET /api/v1/purchase_orders  (list) / GET /api/v1/purchase_orders/:id (single)
 */
export interface RawSkuNexusPurchaseOrder {
  id: string | number
  order_number?: string
  vendor_id?: string | number | null
  vendor_name?: string
  status?: string
  currency?: string
  subtotal?: number | string
  total?: number | string
  destination_location_id?: string | number | null
  line_items?: Array<{
    id?: string | number
    product_id: string | number
    quantity_ordered: number | string
    quantity_received?: number | string
    unit_cost?: number | string
    line_total?: number | string
  }>
  ordered_at?: string
  expected_at?: string
  received_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': case 'pending': return 'draft'
    case 'ordered': case 'submitted': case 'sent': return 'sent'
    case 'partially_received': case 'partial': return 'partially_received'
    case 'received': return 'received'
    case 'completed': case 'closed': return 'closed'
    case 'voided': case 'cancelled': case 'canceled': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawSkuNexusPurchaseOrder): PurchaseOrder {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.order_number),
    supplierId: raw.vendor_id != null ? String(raw.vendor_id) : (pickStr(raw.vendor_name) ?? ''),
    destinationLocationId: raw.destination_location_id != null ? String(raw.destination_location_id) : undefined,
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: pickNum(raw.subtotal),
    totalAmount: pickNum(raw.total),
    lines: (raw.line_items ?? []).map((l) => ({
      productId: String(l.product_id),
      quantityOrdered: pickNum(l.quantity_ordered) ?? 0,
      quantityReceived: pickNum(l.quantity_received),
      unitCost: pickNum(l.unit_cost),
      lineTotal: pickNum(l.line_total),
    })),
    orderedAt: toIso(raw.ordered_at) ?? toIso(raw.created_at),
    expectedAt: toIso(raw.expected_at),
    receivedAt: toIso(raw.received_at),
    platform: 'skunexus',
    metadata: strMap({}),
    raw,
  }
}
