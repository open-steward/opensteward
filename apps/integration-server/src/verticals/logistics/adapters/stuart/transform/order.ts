import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

export interface StuartJobOrder {
  id: string | number
  status: string | null
  client_reference?: string | null
  pickup_at?: string | null
  pickups?: Array<{ address?: Record<string, unknown> | null; comment?: string | null }> | null
  deliveries?: Array<{
    id?: string | number | null
    status?: string | null
    address?: Record<string, unknown> | null
    tracking_url?: string | null
    client_reference?: string | null
  }> | null
  transport_type?: string | null
  amount?: number | null
  currency?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface StuartJobsListResponse {
  jobs?: StuartJobOrder[] | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'new':
    case 'scheduled':               return 'PENDING'
    case 'searching':               return 'PROCESSING'
    case 'in_progress':
    case 'almost_picking':
    case 'picking':
    case 'waiting_at_pickup':       return 'AWAITING_SHIPMENT'
    case 'almost_delivering':
    case 'delivering':
    case 'waiting_at_dropoff':      return 'SHIPPED'
    case 'delivered':
    case 'finished':                return 'DELIVERED'
    case 'canceled':
    case 'cancelled':               return 'CANCELLED'
    default:                        return 'UNKNOWN'
  }
}

export function transformOrder(raw: StuartJobOrder): Order {
  const dropoff = raw.deliveries?.[0]
  return {
    id: String(raw.id),
    status: mapOrderStatus(raw.status),
    orderNumber: raw.client_reference ?? dropoff?.client_reference ?? String(raw.id),
    originAddress: toAddress(raw.pickups?.[0]?.address ?? null),
    destinationAddress: toAddress(dropoff?.address ?? null),
    currency: (raw.currency as string | undefined) ?? undefined,
    totalAmount: typeof raw.amount === 'number' ? raw.amount : undefined,
    requestedServiceCode: raw.transport_type ?? undefined,
    orderAt: toISODate(raw.created_at),
    shippedAt: toISODate(raw.pickup_at),
    deliveredAt:
      (raw.status === 'delivered' || raw.status === 'finished')
        ? toISODate(raw.updated_at)
        : undefined,
    cancelledAt:
      (raw.status === 'canceled' || raw.status === 'cancelled')
        ? toISODate(raw.updated_at)
        : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
