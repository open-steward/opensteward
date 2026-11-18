import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface ShipbubbleCourier {
  name?: string | null
  email?: string | null
  phone?: string | null
  tracking_code?: string | null
  tracking_message?: string | null
  rider_info?: unknown
}

export interface ShipbubblePartyAddress {
  name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface ShipbubblePackageStatus {
  status?: string | null
  datetime?: string | null
}

export interface ShipbubbleTrackingEvent {
  location?: string | null
  message?: string | null
  captured?: string | null
}

export interface ShipbubbleShipment {
  order_id: string
  status?: string | null
  courier?: ShipbubbleCourier | null
  ship_from?: ShipbubblePartyAddress | null
  ship_to?: ShipbubblePartyAddress | null
  package_status?: ShipbubblePackageStatus[]
  dropoff_station?: unknown
  pickup_station?: unknown
  waybill_document?: string | null
  events?: ShipbubbleTrackingEvent[]
  tracking_url?: string | null
  date?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'pending':    return 'PENDING'
    case 'confirmed':  return 'LABEL_CREATED'
    case 'picked_up':  return 'IN_TRANSIT'
    case 'in_transit': return 'IN_TRANSIT'
    case 'completed':  return 'DELIVERED'
    case 'cancelled':  return 'CANCELLED'
    default:           return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShipbubbleShipment): Shipment {
  const courier = raw.courier

  return {
    id: raw.order_id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: courier?.tracking_code ?? undefined,
    carrierId: courier?.name ?? undefined,
    labelUrl: raw.waybill_document ?? undefined,
    originAddress: raw.ship_from
      ? {
          name: raw.ship_from.name ?? undefined,
          phone: raw.ship_from.phone ?? undefined,
          email: raw.ship_from.email ?? undefined,
          street1: raw.ship_from.address ?? undefined,
        }
      : undefined,
    destinationAddress: raw.ship_to
      ? {
          name: raw.ship_to.name ?? undefined,
          phone: raw.ship_to.phone ?? undefined,
          email: raw.ship_to.email ?? undefined,
          street1: raw.ship_to.address ?? undefined,
        }
      : undefined,
    createdAt: toISODate(raw.date),
    metadata: raw as Record<string, unknown>,
  }
}
