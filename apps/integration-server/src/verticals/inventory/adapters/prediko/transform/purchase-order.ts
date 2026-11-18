import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

/**
 * Raw order line (order_part) from GET /api/v1/orders/{id}.
 */
interface RawPredikoOrderPart {
  id?: string
  sku_name?: string
  product_name?: string
  warehouse_name?: string
  supplier_name?: string
  quantity_confirmed?: number
  received?: number
  in_transit?: number
  total_cost?: number
  confirmed_delivery_date?: string
  initial_delivery_date?: string
  [key: string]: unknown
}

/**
 * Raw order object returned by GET /api/v1/orders and GET /api/v1/orders/{id}.
 */
export interface RawPredikoOrder {
  id: string
  reference?: string
  order_status?: string
  supplier_name?: string
  order_type?: string
  currency?: string
  cost?: number
  quantity_confirmed?: number
  quantity_received?: number
  delivery_date?: string[]
  confirmed_delivery_date?: string[]
  created_at?: string
  warehouse_names?: string[]
  order_parts?: RawPredikoOrderPart[]
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT': return 'draft'
    case 'SENT_FOR_APPROVAL': case 'APPROVED': case 'CONFIRMED': return 'sent'
    case 'PARTIALLY_RECEIVED': return 'partially_received'
    case 'FULLY_RECEIVED': return 'received'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawPredikoOrder): PurchaseOrder {
  const firstWarehouse = raw.warehouse_names?.[0]
  const firstDelivery = raw.delivery_date?.[0] ?? raw.confirmed_delivery_date?.[0]

  return {
    id: raw.id,
    externalId: raw.id,
    number: pickStr(raw.reference),
    supplierId: pickStr(raw.supplier_name) ?? '',
    destinationLocationId: firstWarehouse ? pickStr(firstWarehouse) : undefined,
    status: mapStatus(raw.order_status),
    currency: pickStr(raw.currency),
    subtotalAmount: undefined,
    totalAmount: raw.cost,
    lines: (raw.order_parts ?? []).map((l) => ({
      productId: pickStr(l.sku_name) ?? pickStr(l.id) ?? '',
      quantityOrdered: l.quantity_confirmed ?? 0,
      quantityReceived: l.received,
      unitCost: undefined,
      lineTotal: l.total_cost,
    })),
    expectedAt: toIso(firstDelivery),
    orderedAt: toIso(raw.created_at),
    receivedAt: undefined,
    platform: 'prediko',
    metadata: strMap({
      orderType: raw.order_type,
      quantityConfirmed: raw.quantity_confirmed,
      quantityReceived: raw.quantity_received,
    }),
    raw,
  }
}
