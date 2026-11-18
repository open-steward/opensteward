import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * Raw shape returned by GET/POST /deliveries and GET /deliveries/:id
 * (confirmed via official Bosta Node.js + Python SDK source)
 */
export interface BostaDeliveryRaw {
  _id?: string | null
  trackingNumber?: string | null
  state?: { code?: number | null; value?: string | null } | string | null
  type?: number | string | null
  cod?: number | null
  pickupAddress?: Record<string, unknown> | null
  dropOffAddress?: Record<string, unknown> | null
  receiver?: Record<string, unknown> | null
  businessReference?: string | null
  notes?: string | null
  creationTimestamp?: string | number | null
  updatedAt?: string | number | null
  [key: string]: unknown
}

export interface BostaDeliveryListRaw {
  data?: {
    deliveries?: BostaDeliveryRaw[]
    count?: number
  }
  success?: boolean
  message?: string
}

function mapOrderStatus(state: BostaDeliveryRaw['state']): OrderStatus {
  const raw: string =
    typeof state === 'object' && state !== null
      ? String(state.value ?? state.code ?? '')
      : String(state ?? '')
  const s = raw.toUpperCase()
  if (s.includes('DELIVER') && s.includes('FAIL')) return 'CANCELLED'
  if (s.includes('DELIVERED')) return 'DELIVERED'
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY')) return 'SHIPPED'
  if (s.includes('TRANSIT') || s.includes('IN_TRANSIT') || s.includes('SHIPPED')) return 'SHIPPED'
  if (s.includes('CANCEL') || s.includes('TERMINAT')) return 'CANCELLED'
  if (s.includes('RETURN')) return 'RETURNED'
  if (s.includes('CREAT') || s.includes('PENDING') || s.includes('RECEIVED')) return 'PENDING'
  if (s.includes('PROCESS') || s.includes('PICKED')) return 'PROCESSING'
  if (s.includes('HOLD')) return 'ON_HOLD'
  return 'PENDING'
}

export function transformOrder(raw: BostaDeliveryRaw): Order {
  return {
    id: raw._id ?? undefined,
    orderNumber: raw.trackingNumber ?? raw.businessReference ?? raw._id ?? undefined,
    status: mapOrderStatus(raw.state),
    originAddress: toAddress(raw.pickupAddress),
    destinationAddress: toAddress(raw.dropOffAddress ?? raw.receiver),
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    totalAmount: typeof raw.cod === 'number' ? raw.cod : undefined,
    createdAt: toISODate(raw.creationTimestamp),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
