import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'
import type { GlovoOrder } from './order'

/**
 * Glovo maps on-demand delivery orders to canonical Shipments.
 * Glovo does not expose a separate shipment resource — orders are the top-level
 * delivery entity.
 */

function mapShipmentStatus(state: string | null | undefined): ShipmentStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'SCHEDULED':
    case 'PENDING':
      return 'PENDING'
    case 'ACCEPTED':
    case 'PICKING':
      return 'LABEL_CREATED'
    case 'IN_TRANSIT':
    case 'ON_THE_WAY':
      return 'IN_TRANSIT'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELED':
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: GlovoOrder): Shipment {
  const deliveryAddress = (raw.addresses ?? []).find(
    (a) => !a.label?.toLowerCase().includes('pickup'),
  )
  const pickupAddress = (raw.addresses ?? []).find((a) =>
    a.label?.toLowerCase().includes('pickup'),
  )

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.state),
    carrierId: 'glovo',
    originAddress: pickupAddress
      ? {
          name: pickupAddress.contactPerson ?? undefined,
          street1: pickupAddress.label ?? undefined,
          phone: pickupAddress.contactPhone ?? undefined,
        }
      : undefined,
    destinationAddress: deliveryAddress
      ? {
          name: deliveryAddress.contactPerson ?? undefined,
          street1: deliveryAddress.label ?? undefined,
          phone: deliveryAddress.contactPhone ?? undefined,
        }
      : undefined,
    cost: raw.total?.amount != null && raw.total?.currency != null
      ? {
          amount: raw.total.amount,
          currency: raw.total.currency as import('../../../schema/shared').Money['currency'],
        }
      : undefined,
    notes: raw.description ?? undefined,
    mode: 'parcel',
    createdAt: toISODate(raw.createdAt ?? raw.scheduleTime),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
