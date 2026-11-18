import type { Order } from '../../../schema/order'
import { toISODate, nonempty } from '../../shared/transform'
import { transformAddress, type GigAddress } from './address'
import { GIG_DEFAULT_CURRENCY } from '../constants'

/**
 * Raw order object from the GIG Logistics API.
 *
 * GIGL models orders as delivery requests that may encompass one or more
 * shipment waybills. An order holds sender/receiver details and a list of
 * associated waybill numbers.
 */
export interface GigOrder {
  id?: string | null
  orderNumber?: string | null
  status?: string | null
  customerId?: string | null
  currency?: string | null
  senderDetail?: GigAddress | null
  receiverDetail?: GigAddress | null
  waybillNumbers?: string[] | null
  shipmentIds?: string[] | null
  totalAmount?: number | null
  shippingAmount?: number | null
  notes?: string | null
  orderedAt?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  cancelledAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapOrderStatus(raw: string | null | undefined) {
  if (!raw) return undefined
  const s = raw.toLowerCase().replace(/[_\s-]/g, '')
  switch (s) {
    case 'pending':    return 'PENDING' as const
    case 'processing': return 'PROCESSING' as const
    case 'onhold':     return 'ON_HOLD' as const
    case 'awaitingshipment':
    case 'readytoship': return 'AWAITING_SHIPMENT' as const
    case 'shipped':
    case 'intransit':  return 'SHIPPED' as const
    case 'delivered':  return 'DELIVERED' as const
    case 'cancelled':
    case 'canceled':   return 'CANCELLED' as const
    case 'returned':   return 'RETURNED' as const
    default:           return undefined
  }
}

export function transformOrder(raw: GigOrder): Order {
  const shipmentIds = nonempty([
    ...(raw.shipmentIds ?? []),
    ...(raw.waybillNumbers ?? []),
  ])

  return {
    id: raw.id ?? undefined,
    orderNumber: raw.orderNumber ?? undefined,
    status: mapOrderStatus(raw.status),
    customerId: raw.customerId ?? undefined,
    currency: raw.currency ?? GIG_DEFAULT_CURRENCY,
    originAddress: raw.senderDetail ? transformAddress(raw.senderDetail) : undefined,
    destinationAddress: raw.receiverDetail ? transformAddress(raw.receiverDetail) : undefined,
    shipmentIds,
    totalAmount: raw.totalAmount ?? undefined,
    shippingAmount: raw.shippingAmount ?? undefined,
    notes: raw.notes ?? undefined,
    orderAt: toISODate(raw.orderedAt),
    shippedAt: toISODate(raw.shippedAt),
    deliveredAt: toISODate(raw.deliveredAt),
    cancelledAt: toISODate(raw.cancelledAt),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
