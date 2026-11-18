import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type ShipcloudAddress } from './address'

/**
 * A package within a shipcloud shipment.
 * Dimensions are in cm; weight is in kg.
 */
export interface ShipcloudPackage {
  id?: string | null
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  tracking_events?: ShipcloudTrackingEvent[] | null
  [key: string]: unknown
}

/**
 * A raw tracking event embedded within a package.
 */
export interface ShipcloudTrackingEvent {
  id?: string | null
  timestamp?: string | null
  location?: string | null
  status?: string | null
  details?: string | null
  [key: string]: unknown
}

/**
 * Top-level shipcloud shipment response object.
 */
export interface ShipcloudShipment {
  id: string
  carrier_tracking_no?: string | null
  tracking_url?: string | null
  label_url?: string | null
  price?: number | null
  carrier?: string | null
  service?: string | null
  reference_number?: string | null
  notification_email?: string | null
  from?: ShipcloudAddress | null
  to?: ShipcloudAddress | null
  packages?: ShipcloudPackage[] | null
  created_at?: string | null
  carrier_tracking_no_second?: string | null
  [key: string]: unknown
}

/**
 * Map shipcloud tracking/carrier status strings to canonical ShipmentStatus.
 * shipcloud tracking event statuses:
 *   label_created, picked_up, transit, out_for_delivery, delivered,
 *   awaits_pickup_by_receiver, canceled, delayed, exception, not_delivered,
 *   destroyed, notification, unknown
 */
function mapShipmentStatus(raw: ShipcloudShipment): ShipmentStatus {
  // Derive status from the latest tracking event across all packages
  const allEvents = (raw.packages ?? []).flatMap((p) => p.tracking_events ?? [])
  if (allEvents.length === 0) {
    // No tracking events yet — if we have a label_url it was created
    return raw.label_url ? 'LABEL_CREATED' : 'UNKNOWN'
  }

  // Take the last event's status as the most recent
  const last = allEvents[allEvents.length - 1]
  return mapTrackingStatus(last?.status ?? '')
}

export function mapTrackingStatus(status: string): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'label_created':               return 'LABEL_CREATED'
    case 'picked_up':                   return 'IN_TRANSIT'
    case 'transit':                     return 'IN_TRANSIT'
    case 'out_for_delivery':            return 'OUT_FOR_DELIVERY'
    case 'delivered':                   return 'DELIVERED'
    case 'awaits_pickup_by_receiver':   return 'OUT_FOR_DELIVERY'
    case 'canceled':                    return 'CANCELLED'
    case 'delayed':                     return 'IN_TRANSIT'
    case 'exception':                   return 'EXCEPTION'
    case 'not_delivered':               return 'EXCEPTION'
    case 'destroyed':                   return 'EXCEPTION'
    case 'return_to_sender':            return 'RETURNED'
    case 'unknown':
    default:                            return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShipcloudShipment): Shipment {
  // shipcloud allows multiple packages; use the first for dimensions/weight
  const firstPkg = (raw.packages ?? [])[0]

  return {
    id: raw.id,
    status: mapShipmentStatus(raw),
    trackingNumber: raw.carrier_tracking_no ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    originAddress: raw.from ? transformAddress(raw.from) : undefined,
    destinationAddress: raw.to ? transformAddress(raw.to) : undefined,
    totalWeight: firstPkg ? toWeight(firstPkg.weight, 'kg') : undefined,
    dimensions: firstPkg
      ? toDimensions(firstPkg.length, firstPkg.width, firstPkg.height, 'cm')
      : undefined,
    labelUrl: raw.label_url ?? undefined,
    cost: raw.price != null
      ? {
          amount: parseDecimal(raw.price) ?? 0,
          currency: 'EUR',
        }
      : undefined,
    reference: raw.reference_number ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
