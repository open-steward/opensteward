import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress } from '../../shared/transform'
import { toISODate } from '../../shared/transform'

export interface CurriDeliveryStatus {
  name?: string | null
  code?: string | null
}

export interface CurriAddress {
  name?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface CurriDeliveryMeta {
  dropoffNote?: string | null
  pickupNote?: string | null
  poNumber?: string | null
  orderNumber?: string | null
}

export interface CurriDelivery {
  id: string
  createdAt?: string | null
  deliveredAt?: string | null
  price?: number | null
  distance?: number | null
  estimatedTravelTime?: number | null
  deliveryMethod?: string | null
  deliveryStatus?: CurriDeliveryStatus | null
  origin?: CurriAddress | null
  destination?: CurriAddress | null
  trackingUrl?: string | null
  deliveryMeta?: CurriDeliveryMeta | null
  cancellationReason?: string | null
  [key: string]: unknown
}

function mapStatus(status: CurriDeliveryStatus | null | undefined): ShipmentStatus {
  const code = ((status?.code ?? status?.name) ?? '').toLowerCase()
  switch (code) {
    case 'pending':
      return 'LABEL_CREATED'
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
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function curriAddressToRaw(addr: CurriAddress | null | undefined): Record<string, unknown> | null {
  if (!addr) return null
  return {
    name: addr.name,
    address1: addr.addressLine1,
    address2: addr.addressLine2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
  }
}

export function transformShipment(raw: CurriDelivery): Shipment {
  return {
    id: raw.id,
    status: mapStatus(raw.deliveryStatus),
    trackingNumber: raw.id,
    carrierId: 'curri',
    serviceCode: raw.deliveryMethod ?? undefined,
    originAddress: toAddress(curriAddressToRaw(raw.origin)),
    destinationAddress: toAddress(curriAddressToRaw(raw.destination)),
    labelUrl: raw.trackingUrl ?? undefined,
    reference: raw.deliveryMeta?.orderNumber ?? raw.deliveryMeta?.poNumber ?? undefined,
    notes: raw.deliveryMeta?.pickupNote ?? undefined,
    cost:
      raw.price != null
        ? { amount: raw.price, currency: 'USD' }
        : undefined,
    createdAt: toISODate(raw.createdAt),
    actualDeliveryAt: toISODate(raw.deliveredAt),
    metadata: raw as Record<string, unknown>,
  }
}
