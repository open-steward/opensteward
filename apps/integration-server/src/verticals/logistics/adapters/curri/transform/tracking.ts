import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress } from '../../shared/transform'
import { toISODate } from '../../shared/transform'
import type { CurriDelivery, CurriDeliveryStatus } from './shipment'
import { curriAddressToRaw } from './shipment'

function mapTrackingStatus(status: CurriDeliveryStatus | null | undefined): TrackingEventStatus {
  const code = ((status?.code ?? status?.name) ?? '').toLowerCase()
  switch (code) {
    case 'pending':
      return 'PRE_TRANSIT'
    case 'en_route_to_origin':
    case 'at_origin':
    case 'en_route_to_destination':
      return 'IN_TRANSIT'
    case 'at_destination':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'canceled':
    case 'cancelled':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: CurriDelivery): TrackingEvent[] {
  return [
    {
      shipmentId: raw.id,
      trackingNumber: raw.id,
      carrierId: 'curri',
      status: mapTrackingStatus(raw.deliveryStatus),
      description: raw.deliveryStatus?.name ?? undefined,
      location: toAddress(curriAddressToRaw(raw.destination)),
      occurredAt: toISODate(raw.deliveredAt ?? raw.createdAt),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
