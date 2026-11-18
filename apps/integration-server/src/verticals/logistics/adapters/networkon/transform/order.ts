import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// NetworkON order as returned by the REST API.
export interface NetworkONOrder {
  id?: string | number | null
  order_number?: string | null
  status?: string | null
  customer_id?: string | number | null
  origin?: Record<string, unknown> | null
  destination?: Record<string, unknown> | null
  items?: Array<{
    id?: string | number | null
    sku?: string | null
    name?: string | null
    description?: string | null
    quantity?: number | null
    unit_price?: number | null
    total_price?: number | null
  }> | null
  currency?: string | null
  subtotal?: number | null
  tax?: number | null
  shipping_cost?: number | null
  discount?: number | null
  total?: number | null
  notes?: string | null
  service_code?: string | null
  ordered_at?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): OrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'processing':
      return 'PROCESSING'
    case 'on_hold':
    case 'on hold':
    case 'hold':
      return 'ON_HOLD'
    case 'awaiting_shipment':
    case 'ready':
    case 'label_created':
      return 'AWAITING_SHIPMENT'
    case 'dispatched':
    case 'in_transit':
    case 'shipped':
    case 'picked_up':
      return 'SHIPPED'
    case 'delivered':
    case 'completed':
    case 'successful':
      return 'DELIVERED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'returned':
      return 'RETURNED'
    default:
      return 'unknown'
  }
}

export function transformOrder(raw: NetworkONOrder): Order {
  const id = raw.id != null ? String(raw.id) : undefined
  return {
    id,
    status: mapStatus(raw.status),
    orderNumber: raw.order_number ?? id,
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    originAddress: toAddress(raw.origin ?? undefined),
    destinationAddress: toAddress(raw.destination ?? undefined),
    lineItems: (raw.items ?? []).map((item) => ({
      id: item.id != null ? String(item.id) : undefined,
      sku: item.sku ?? undefined,
      name: item.name ?? undefined,
      description: item.description ?? undefined,
      quantity: item.quantity ?? undefined,
      unitAmount: item.unit_price ?? undefined,
      totalAmount: item.total_price ?? undefined,
    })),
    currency: raw.currency ?? undefined,
    subtotalAmount: raw.subtotal ?? undefined,
    taxAmount: raw.tax ?? undefined,
    shippingAmount: raw.shipping_cost ?? undefined,
    discountAmount: raw.discount ?? undefined,
    totalAmount: raw.total ?? undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_code ?? undefined,
    orderAt: toISODate(raw.ordered_at ?? raw.created_at),
    shippedAt: toISODate(raw.shipped_at),
    deliveredAt: toISODate(raw.delivered_at),
    cancelledAt: toISODate(raw.cancelled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
