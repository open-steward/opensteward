import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'
import { transformAddress, type Locate2uContact } from './address'

export interface Locate2uStop {
  stopId?: number | null
  status?: string | null
  contact?: Locate2uContact | null
  address?: string | null
  tripDate?: string | null
  [key: string]: unknown
}

export interface Locate2uOrder {
  shipmentId?: number | null
  status?: string | null
  shipmentRef?: string | null
  contact?: Locate2uContact | null
  tripDate?: string | null
  lastModifiedDate?: string | null
  notes?: string | null
  customerId?: number | null
  pickupStop?: Locate2uStop | null
  dropStop?: Locate2uStop | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'unassigned':
      return 'PENDING'
    case 'assigned':
    case 'accepted':
      return 'PROCESSING'
    case 'inprogress':
    case 'in_progress':
      return 'AWAITING_SHIPMENT'
    case 'completed':
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
    case 'rejected':
    case 'discarded':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformOrder(raw: Locate2uOrder): Order {
  const pickupStop = raw.pickupStop ?? null
  const dropStop = raw.dropStop ?? null

  const originAddress = pickupStop
    ? transformAddress(pickupStop.address, pickupStop.contact ?? raw.contact)
    : undefined

  const destinationAddress = dropStop
    ? transformAddress(dropStop.address, dropStop.contact ?? raw.contact)
    : undefined

  return {
    id: raw.shipmentId != null ? String(raw.shipmentId) : undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.shipmentRef ?? undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    originAddress,
    destinationAddress,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.tripDate),
    updatedAt: toISODate(raw.lastModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
