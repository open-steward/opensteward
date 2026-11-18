import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

/**
 * Glovo order address embedded in the order object.
 */
export interface GlovoOrderAddress {
  lat?: number | null
  lon?: number | null
  label?: string | null
  details?: string | null
  contactPerson?: string | null
  contactPhone?: string | null
}

/**
 * Glovo order object returned by POST /orders and GET /orders/{orderId}.
 */
export interface GlovoOrder {
  id?: string | null
  state?: string | null
  description?: string | null
  scheduleTime?: string | null
  total?: {
    amount?: number | null
    currency?: string | null
  } | null
  addresses?: GlovoOrderAddress[]
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapOrderStatus(state: string | null | undefined): OrderStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'SCHEDULED':
    case 'PENDING':
      return 'PENDING'
    case 'ACCEPTED':
    case 'PICKING':
      return 'PROCESSING'
    case 'IN_TRANSIT':
    case 'ON_THE_WAY':
      return 'SHIPPED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELED':
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformOrder(raw: GlovoOrder): Order {
  const deliveryAddress = (raw.addresses ?? []).find(
    (a) => !a.label?.toLowerCase().includes('pickup'),
  )
  const pickupAddress = (raw.addresses ?? []).find((a) =>
    a.label?.toLowerCase().includes('pickup'),
  )

  return {
    id: raw.id ?? undefined,
    status: mapOrderStatus(raw.state),
    orderNumber: raw.id ?? undefined,
    destinationAddress: deliveryAddress
      ? {
          name: deliveryAddress.contactPerson ?? undefined,
          street1: deliveryAddress.label ?? undefined,
          phone: deliveryAddress.contactPhone ?? undefined,
        }
      : undefined,
    originAddress: pickupAddress
      ? {
          name: pickupAddress.contactPerson ?? undefined,
          street1: pickupAddress.label ?? undefined,
          phone: pickupAddress.contactPhone ?? undefined,
        }
      : undefined,
    currency: (raw.total?.currency ?? undefined) as Order['currency'],
    totalAmount: raw.total?.amount ?? undefined,
    notes: raw.description ?? undefined,
    createdAt: toISODate(raw.createdAt ?? raw.scheduleTime),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
