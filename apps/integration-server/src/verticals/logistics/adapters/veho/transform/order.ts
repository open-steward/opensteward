import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

export interface VehoOrder {
  _id?: string | null
  order_id?: string | null
  currentState?: string | null
  status?: string | null
  barcode?: string | null
  tracking_number?: string | null
  destination?: Record<string, unknown> | null
  recipient?: string | null
  serviceClass?: string | null
  packages?: Array<Record<string, unknown>> | null
  reference?: string | null
  notes?: string | null
  instructions?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): OrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
    case 'created':          return 'PENDING'
    case 'processing':
    case 'accepted':         return 'PROCESSING'
    case 'awaiting_shipment':
    case 'ready':            return 'AWAITING_SHIPMENT'
    case 'in_transit':
    case 'shipped':          return 'SHIPPED'
    case 'out_for_delivery':
    case 'delivered':        return 'DELIVERED'
    case 'cancelled':
    case 'canceled':         return 'CANCELLED'
    case 'returned':         return 'RETURNED'
    case 'on_hold':          return 'ON_HOLD'
    default:                 return 'UNKNOWN'
  }
}

export function transformOrder(raw: VehoOrder): Order {
  const id = raw._id ?? raw.order_id ?? ''
  const state = raw.currentState ?? raw.status

  // Build destination address — destination may contain recipient name
  const destRaw: Record<string, unknown> = {
    ...(raw.destination ?? {}),
    ...(raw.recipient ? { name: raw.recipient } : {}),
  }

  return {
    id,
    status: mapStatus(state),
    orderNumber: raw.barcode ?? raw.tracking_number ?? raw.reference ?? undefined,
    requestedServiceCode: raw.serviceClass ?? undefined,
    destinationAddress: toAddress(destRaw) ?? undefined,
    notes: raw.notes ?? raw.instructions ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
