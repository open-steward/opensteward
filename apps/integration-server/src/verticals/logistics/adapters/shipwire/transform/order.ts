import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress, parseDecimal } from '../../shared/transform'

// ─── Shipwire raw types ────────────────────────────────────────────────────

export interface ShipwireOrderItem {
  sku: string | null
  name: string | null
  quantity: number | null
  unit_price: number | null
  [key: string]: unknown
}

export interface ShipwireOrder {
  id: number
  order_number: string | null
  external_id: string | null
  status: string | null
  warehouse_id: number | null
  shipping_address: Record<string, unknown> | null
  items: ShipwireOrderItem[] | null
  shipment_ids: string[] | null
  shipping_amount: number | null
  total_amount: number | null
  currency: string | null
  requested_service: string | null
  notes: string | null
  order_date: string | null
  shipped_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'submitted':    return 'PENDING'
    case 'processing':   return 'PROCESSING'
    case 'completed':    return 'DELIVERED'
    case 'cancelled':    return 'CANCELLED'
    case 'held':         return 'ON_HOLD'
    case 'returned':     return 'RETURNED'
    default:             return 'PENDING'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: ShipwireOrder): Order {
  const lineItems = (raw.items ?? []).map((item, idx) => ({
    id: String(idx),
    sku: item.sku ?? undefined,
    name: item.name ?? undefined,
    quantity: item.quantity ?? undefined,
    unitAmount: parseDecimal(item.unit_price),
  }))

  return {
    id: String(raw.id),
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? raw.external_id ?? undefined,
    warehouseId: raw.warehouse_id != null ? String(raw.warehouse_id) : undefined,
    destinationAddress: toAddress(raw.shipping_address),
    shipmentIds: raw.shipment_ids ?? undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? 'USD',
    shippingAmount: parseDecimal(raw.shipping_amount),
    totalAmount: parseDecimal(raw.total_amount),
    requestedServiceCode: raw.requested_service ?? undefined,
    notes: raw.notes ?? undefined,
    orderAt: toISODate(raw.order_date),
    shippedAt: toISODate(raw.shipped_at),
    deliveredAt: toISODate(raw.delivered_at),
    cancelledAt: toISODate(raw.cancelled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
