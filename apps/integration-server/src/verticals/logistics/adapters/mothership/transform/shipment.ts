import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

/**
 * Mothership address structure — uses `street` and `zip` (not `street1` / `postalCode`).
 */
export interface MothershipAddress {
  name?: string
  street?: string
  subStreet?: string
  city?: string
  state?: string
  zip?: string
  phoneNumber?: string
  emails?: string[]
  [key: string]: unknown
}

/**
 * Mothership freight line item.
 */
export interface MothershipFreightItem {
  quantity?: number
  type?: string
  weight?: number
  length?: number
  width?: number
  height?: number
  description?: string
  [key: string]: unknown
}

/**
 * Partner / carrier info attached to a shipment.
 */
export interface MothershipPartner {
  name?: string
  pickupNumber?: string
  proNumber?: string
  [key: string]: unknown
}

/**
 * A single shipment object from the Mothership API.
 * `price` is a USD float (e.g. 79.5), NOT cents.
 */
export interface MothershipShipmentResponse {
  id?: string
  createdAt?: string
  status?: string
  /** USD float */
  price?: number
  earliestPickupDate?: string
  estimatedDeliveryDate?: string
  trackingUrl?: string
  pickup?: MothershipAddress
  delivery?: MothershipAddress
  freight?: MothershipFreightItem[]
  partner?: MothershipPartner
  [key: string]: unknown
}

/**
 * Wrapper used by single-shipment endpoints (`GET /shipments/:id`).
 */
export interface MothershipShipmentDataWrapper {
  data?: MothershipShipmentResponse
  [key: string]: unknown
}

function mapShipmentStatus(raw: string | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  const lower = raw.toLowerCase().replace(/\s+/g, '_')
  return (SHIPMENT_STATUS_MAP[lower] as ShipmentStatus) ?? 'UNKNOWN'
}

export function transformShipment(raw: MothershipShipmentResponse): Shipment {
  const pickup = raw.pickup
  const delivery = raw.delivery
  const partner = raw.partner

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.status),
    // Mothership uses proNumber as the carrier-issued tracking number
    trackingNumber: partner?.proNumber ?? partner?.pickupNumber ?? undefined,
    carrierId: 'mothership',
    // Service code derived from partner name when available
    serviceCode: partner?.name ?? undefined,
    labelUrl: raw.trackingUrl ?? undefined,
    originAddress: pickup
      ? {
          name: pickup.name ?? undefined,
          street1: pickup.street ?? undefined,
          street2: pickup.subStreet ?? undefined,
          city: pickup.city ?? undefined,
          state: pickup.state ?? undefined,
          postalCode: pickup.zip ?? undefined,
          phone: pickup.phoneNumber ?? undefined,
          email: pickup.emails?.[0] ?? undefined,
        }
      : undefined,
    destinationAddress: delivery
      ? {
          name: delivery.name ?? undefined,
          street1: delivery.street ?? undefined,
          street2: delivery.subStreet ?? undefined,
          city: delivery.city ?? undefined,
          state: delivery.state ?? undefined,
          postalCode: delivery.zip ?? undefined,
          phone: delivery.phoneNumber ?? undefined,
          email: delivery.emails?.[0] ?? undefined,
        }
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    // Price is a USD float; store as cents integer in canonical Money
    cost:
      typeof raw.price === 'number'
        ? { amount: Math.round(raw.price * 100), currency: 'USD' }
        : undefined,
    mode: 'ltl',
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function unwrapShipment(res: MothershipShipmentDataWrapper): MothershipShipmentResponse {
  return res.data ?? (res as MothershipShipmentResponse)
}
