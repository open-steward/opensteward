import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

// WarpShipmentResponse is the shape returned by GET /api/v1/bookings (list)
// and GET /api/v1/track (single). Warp has no separate orders concept —
// a booking maps 1-to-1 onto an Order.
export interface WarpOrderResponse {
  shipment_id?: string
  shipment_number?: string
  order_id?: string
  order_number?: string
  tracking_number?: string
  mode?: string
  status?: string
  origin_zip?: string
  destination_zip?: string
  pickup_date?: string
  delivery_date?: string
  price_usd?: number
  booked_at?: string
  cancelled_at?: string | null
  pickup_address?: {
    city?: string
    state?: string
    zipCode?: string
    street?: string
    contactName?: string
    phone?: string
    email?: string
    [key: string]: unknown
  }
  delivery_address?: {
    city?: string
    state?: string
    zipCode?: string
    street?: string
    contactName?: string
    phone?: string
    email?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

const STATUS_MAP: Record<string, OrderStatus> = {
  booked: 'AWAITING_SHIPMENT',
  needCarrier: 'AWAITING_SHIPMENT',
  arrivedAtPickup: 'PROCESSING',
  pickupSuccessful: 'PROCESSING',
  inRouteToWarehouse: 'SHIPPED',
  arrivedAtWarehouse: 'SHIPPED',
  departedFromWarehouse: 'SHIPPED',
  inRouteToDelivery: 'SHIPPED',
  delivered: 'DELIVERED',
  exception: 'ON_HOLD',
  cancelled: 'CANCELLED',
}

function mapOrderStatus(code: string | undefined): OrderStatus {
  if (!code) return 'PENDING'
  return STATUS_MAP[code] ?? 'PENDING'
}

export function transformOrder(raw: WarpOrderResponse): Order {
  const originAddress = raw.pickup_address
    ? {
        name: raw.pickup_address.contactName ?? undefined,
        street1: raw.pickup_address.street ?? undefined,
        city: raw.pickup_address.city ?? undefined,
        state: raw.pickup_address.state ?? undefined,
        postalCode: raw.pickup_address.zipCode ?? raw.origin_zip ?? undefined,
        country: 'US' as const,
        phone: raw.pickup_address.phone ?? undefined,
        email: raw.pickup_address.email ?? undefined,
      }
    : raw.origin_zip
      ? { postalCode: raw.origin_zip, country: 'US' as const }
      : undefined

  const destinationAddress = raw.delivery_address
    ? {
        name: raw.delivery_address.contactName ?? undefined,
        street1: raw.delivery_address.street ?? undefined,
        city: raw.delivery_address.city ?? undefined,
        state: raw.delivery_address.state ?? undefined,
        postalCode: raw.delivery_address.zipCode ?? raw.destination_zip ?? undefined,
        country: 'US' as const,
        phone: raw.delivery_address.phone ?? undefined,
        email: raw.delivery_address.email ?? undefined,
      }
    : raw.destination_zip
      ? { postalCode: raw.destination_zip, country: 'US' as const }
      : undefined

  const totalAmount =
    raw.price_usd !== undefined && raw.price_usd !== null
      ? Math.round(raw.price_usd * 100)
      : undefined

  return {
    id: raw.order_id ?? raw.shipment_id ?? undefined,
    orderNumber: raw.order_number ?? raw.shipment_number ?? undefined,
    status: mapOrderStatus(raw.status),
    shipmentIds: raw.shipment_id ? [raw.shipment_id] : undefined,
    originAddress,
    destinationAddress,
    currency: 'USD',
    totalAmount,
    shippedAt: toISODate(raw.pickup_date),
    deliveredAt: toISODate(raw.delivery_date),
    cancelledAt: raw.cancelled_at ? toISODate(raw.cancelled_at) : undefined,
    createdAt: toISODate(raw.booked_at),
    metadata: raw as Record<string, unknown>,
  }
}
