import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickNum, pickStr, strMap, toIso} from './shared'

/**
 * Raw replenishment (purchase order) record from ShipEdge Replenishment v3
 * GET /get_reple/<reple_id>/<warehouse> → `data` field.
 */
export interface RawShipEdgePurchaseOrder {
  reple_id: string | number
  po_num?: string
  status?: string
  tracking_num?: string
  supplier_name?: string
  comments?: string
  expected_delivery_date?: string
  pre_sync?: string
  items?: Array<{
    sku: string
    description?: string
    qty_request?: number | string
    qty_received?: number | string
    bin?: string | null
    lpn?: string | null
    lot?: string | null
    expir?: string | null
    uom?: string | null
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'new': case 'pending': return 'draft'
    case 'intransit': case 'in transit': case 'shipped': return 'sent'
    case 'partial': case 'partially received': return 'partially_received'
    case 'received': return 'received'
    case 'completed': case 'closed': return 'closed'
    case 'cancelled': case 'voided': return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawShipEdgePurchaseOrder): PurchaseOrder {
  const id = String(raw.reple_id)

  return {
    id,
    externalId: id,
    number: pickStr(raw.po_num),
    // ShipEdge stores supplier by name in v3; use name as the id key
    supplierId: pickStr(raw.supplier_name) ?? '',
    destinationLocationId: undefined,
    status: mapStatus(raw.status),
    currency: undefined,
    subtotalAmount: undefined,
    totalAmount: undefined,
    lines: (raw.items ?? []).map((item) => ({
      // ShipEdge PO lines reference SKUs, not numeric product IDs
      productId: item.sku,
      quantityOrdered: pickNum(item.qty_request) ?? 0,
      quantityReceived: pickNum(item.qty_received),
      unitCost: undefined,
      lineTotal: undefined,
    })),
    expectedAt: toIso(raw.expected_delivery_date),
    orderedAt: undefined,
    receivedAt: undefined,
    platform: 'shipedge',
    metadata: strMap({
      trackingNum: raw.tracking_num,
      comments: raw.comments,
      preSync: raw.pre_sync,
    }),
    raw,
  }
}
