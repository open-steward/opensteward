import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw purchase-order record from GET /api/v1/purchase-orders (PULPO WMS).
 */
export interface RawPulpoWmsPurchaseOrder {
  id: string
  number?: string
  reference?: string
  supplier_id?: string
  supplier_name?: string
  status?: string
  currency?: string
  subtotal?: number
  total?: number
  destination_warehouse_id?: string
  lines?: Array<{
    product_id: string
    quantity_ordered: number
    quantity_received?: number
    unit_price?: number
    line_total?: number
  }>
  ordered_at?: string
  expected_at?: string
  received_at?: string
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft': return 'draft'
    case 'sent': case 'ordered': case 'confirmed': return 'sent'
    case 'partially_received': case 'partial': return 'partially_received'
    case 'received': return 'received'
    case 'completed': case 'closed': return 'closed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawPulpoWmsPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.number) ?? pickStr(raw.reference),
    supplierId: raw.supplier_id ?? raw.supplier_name ?? '',
    destinationLocationId: pickStr(raw.destination_warehouse_id),
    status: mapStatus(raw.status),
    currency: pickStr(raw.currency),
    subtotalAmount: raw.subtotal,
    totalAmount: raw.total,
    lines: (raw.lines ?? []).map((l) => ({
      productId: l.product_id,
      quantityOrdered: l.quantity_ordered,
      quantityReceived: l.quantity_received,
      unitCost: l.unit_price,
      lineTotal: l.line_total,
    })),
    orderedAt: toIso(raw.ordered_at),
    expectedAt: toIso(raw.expected_at),
    receivedAt: toIso(raw.received_at),
    platform: 'pulpo-wms',
    metadata: strMap({}),
    raw,
  }
}
