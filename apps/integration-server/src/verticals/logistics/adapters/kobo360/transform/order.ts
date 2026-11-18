import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw Kobo360 order / booking object returned from GET /orders or GET /orders/:id
 */
export interface Kobo360OrderResponse {
  id?: string
  order_id?: string
  order_number?: string
  status?: string
  customer_id?: string
  trip_ids?: string[]
  origin?: Record<string, unknown>
  destination?: Record<string, unknown>
  currency?: string
  subtotal?: number
  tax?: number
  shipping_cost?: number
  discount?: number
  total?: number
  notes?: string
  service_code?: string
  ordered_at?: string
  shipped_at?: string
  delivered_at?: string
  cancelled_at?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  ON_HOLD: 'ON_HOLD',
  AWAITING_SHIPMENT: 'AWAITING_SHIPMENT',
  ASSIGNED: 'AWAITING_SHIPMENT',
  SCHEDULED: 'AWAITING_SHIPMENT',
  IN_TRANSIT: 'SHIPPED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
}

function mapOrderStatus(status: string | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  return ORDER_STATUS_MAP[status.toUpperCase()] ?? 'UNKNOWN'
}

export function transformOrder(raw: Kobo360OrderResponse): Order {
  const id = raw.id ?? raw.order_id ?? undefined
  return {
    id: id ? String(id) : undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? undefined,
    customerId: raw.customer_id ? String(raw.customer_id) : undefined,
    shipmentIds: raw.trip_ids?.map(String) ?? undefined,
    originAddress: toAddress(raw.origin as Record<string, unknown> | undefined),
    destinationAddress: toAddress(raw.destination as Record<string, unknown> | undefined),
    currency: raw.currency ?? undefined,
    subtotalAmount: raw.subtotal != null ? Number(raw.subtotal) : undefined,
    taxAmount: raw.tax != null ? Number(raw.tax) : undefined,
    shippingAmount: raw.shipping_cost != null ? Number(raw.shipping_cost) : undefined,
    discountAmount: raw.discount != null ? Number(raw.discount) : undefined,
    totalAmount: raw.total != null ? Number(raw.total) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_code ?? undefined,
    orderAt: toISODate(raw.ordered_at),
    shippedAt: toISODate(raw.shipped_at),
    deliveredAt: toISODate(raw.delivered_at),
    cancelledAt: toISODate(raw.cancelled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
