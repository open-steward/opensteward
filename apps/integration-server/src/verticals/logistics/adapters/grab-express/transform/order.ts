import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// Grab Express delivery response shape (POST /v1/deliveries, GET /v1/deliveries/{deliveryID})
export interface GrabExpressDeliveryRaw {
  deliveryID?: string | null
  merchantOrderID?: string | null
  status?: string | null
  trackingURL?: string | null
  paymentMethod?: string | null
  invoiceNo?: string | null
  sender?: Record<string, unknown> | null
  recipient?: Record<string, unknown> | null
  origin?: Record<string, unknown> | null
  destination?: Record<string, unknown> | null
  timeline?: {
    create?: string | null
    allocate?: string | null
    pickup?: string | null
    dropoff?: string | null
    completed?: string | null
    cancel?: string | null
    fail?: string | null
  } | null
  quote?: {
    serviceType?: string | null
    currency?: string | null
    amount?: number | null
    packages?: Array<Record<string, unknown>>
  } | null
  schedule?: Record<string, unknown> | null
  cashOnDelivery?: Record<string, unknown> | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s === 'COMPLETED') return 'DELIVERED'
  if (s === 'IN_DELIVERY' || s === 'PENDING_DROP_OFF') return 'SHIPPED'
  if (s === 'PICKING_UP' || s === 'PENDING_PICKUP') return 'PROCESSING'
  if (s === 'ALLOCATING' || s === 'QUEUEING') return 'AWAITING_SHIPMENT'
  if (s === 'FAILED' || s === 'RETURNED') return 'RETURNED'
  if (s === 'CANCELLED' || s.includes('CANCEL')) return 'CANCELLED'
  return 'UNKNOWN'
}

export function transformOrder(raw: GrabExpressDeliveryRaw): Order {
  const timeline = raw.timeline ?? {}
  return {
    id: raw.deliveryID ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.merchantOrderID ?? undefined,
    originAddress: toAddress(raw.origin ?? raw.sender),
    destinationAddress: toAddress(raw.destination ?? raw.recipient),
    currency: (raw.quote?.currency ?? undefined) as string | undefined,
    totalAmount: raw.quote?.amount ?? undefined,
    orderAt: toISODate(timeline.create),
    shippedAt: toISODate(timeline.pickup),
    deliveredAt: toISODate(timeline.completed),
    cancelledAt: toISODate(timeline.cancel),
    createdAt: toISODate(timeline.create),
    metadata: raw as Record<string, unknown>,
  }
}
