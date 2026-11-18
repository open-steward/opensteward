import { toIsoDatetime } from '@opensteward/shared'
import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress } from '../../shared/transform'
import { ELOGII_PLATFORM } from '../constants'
import type { ElogiiTask } from './shipment'

// eLogii task state → order status
function mapTaskStateToOrderStatus(state: number | null | undefined): OrderStatus {
  switch (state) {
    case 0: return 'PENDING'
    case 1: return 'PROCESSING'
    case 2: return 'AWAITING_SHIPMENT'
    case 3: return 'DELIVERED'
    case 4: return 'RETURNED'
    case 5: return 'CANCELLED'
    default: return 'UNKNOWN'
  }
}

export function transformOrder(raw: ElogiiTask): Order {
  const destLoc = raw.location
  const pickupLoc = raw.pickupLocation

  const destinationAddress = destLoc?.address
    ? toAddress({
        name: raw.contact?.name ?? null,
        phone: raw.contact?.phone ?? null,
        email: raw.contact?.email ?? null,
        street1: destLoc.address.street ?? null,
        street2: destLoc.address.street2 ?? null,
        city: destLoc.address.city ?? null,
        state: destLoc.address.state ?? null,
        postalCode: destLoc.address.postcode ?? destLoc.address.zip_code ?? null,
        country: destLoc.address.country ?? null,
      })
    : undefined

  const originAddress = pickupLoc?.address
    ? toAddress({
        name: raw.pickupContact?.name ?? null,
        phone: raw.pickupContact?.phone ?? null,
        email: raw.pickupContact?.email ?? null,
        street1: pickupLoc.address.street ?? null,
        street2: pickupLoc.address.street2 ?? null,
        city: pickupLoc.address.city ?? null,
        state: pickupLoc.address.state ?? null,
        postalCode: pickupLoc.address.postcode ?? null,
        country: pickupLoc.address.country ?? null,
      })
    : undefined

  const deliveredAt =
    raw.completedAt && toIsoDatetime(raw.completedAt)
      ? new Date(toIsoDatetime(raw.completedAt)!)
      : undefined

  const cancelledAt =
    raw.state === 5 && raw.updatedAt && toIsoDatetime(raw.updatedAt)
      ? new Date(toIsoDatetime(raw.updatedAt)!)
      : undefined

  return {
    id: raw._id,
    status: mapTaskStateToOrderStatus(raw.state ?? undefined),
    orderNumber: raw.orderNumber ?? raw.externalId ?? raw._id,
    originAddress,
    destinationAddress,
    notes: raw.note ?? undefined,
    deliveredAt,
    cancelledAt,
    createdAt: raw.createdAt && toIsoDatetime(raw.createdAt)
      ? new Date(toIsoDatetime(raw.createdAt)!)
      : undefined,
    updatedAt: raw.updatedAt && toIsoDatetime(raw.updatedAt)
      ? new Date(toIsoDatetime(raw.updatedAt)!)
      : undefined,
    metadata: { ...raw, _platform: ELOGII_PLATFORM } as Record<string, unknown>,
  }
}
