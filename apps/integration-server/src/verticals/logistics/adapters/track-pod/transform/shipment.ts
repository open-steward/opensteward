import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'
import type { TrackPodOrder } from './order'

function mapStatus(raw: string | null | undefined): ShipmentStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'delivered' || s === 'collected') return 'DELIVERED'
  if (s === 'not delivered' || s === 'not collected' || s === 'rejected') return 'EXCEPTION'
  if (s === 'partially') return 'OUT_FOR_DELIVERY'
  if (s === 'in progress' || s === 'active') return 'OUT_FOR_DELIVERY'
  if (s === 'unscheduled' || s === 'pending') return 'PENDING'
  if (s === 'scheduled') return 'LABEL_CREATED'
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  return 'IN_TRANSIT'
}

/**
 * Track-POD orders serve as shipments — each order is a delivery stop.
 * The TrackId is the customer-facing tracking reference.
 */
export function transformShipment(raw: TrackPodOrder): Shipment {
  const addressRaw: Record<string, unknown> = {
    name: raw.ContactName,
    phone: raw.Phone,
    email: raw.Email,
    street1: raw.Address,
  }

  return {
    id: raw.Id ?? raw.TrackId ?? undefined,
    status: mapStatus(raw.Status),
    trackingNumber: raw.TrackId ?? raw.Number ?? undefined,
    carrierId: 'track-pod',
    destinationAddress: toAddress(addressRaw),
    notes: raw.Note ?? undefined,
    reference: raw.Number ?? undefined,
    estimatedDeliveryAt: toIsoDatetime(raw.TimeSlotTo) ? new Date(toIsoDatetime(raw.TimeSlotTo)!) : undefined,
    createdAt: toIsoDatetime(raw.Date) ? new Date(toIsoDatetime(raw.Date)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
