import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

/**
 * Shippify delivery — the primary object returned by GET /v1/deliveries/{id}/complete
 * and the payload items from POST /v1/deliveries.
 *
 * Field reference: https://docs.shippify.co/developers/en/shippify-api/deliveries/get-delivery-information.md
 */
export interface ShippifyTask {
  id?: string | null
  // Status: Shippify returns numeric status + _status (name string)
  status?: number | string | null
  _status?: string | null
  referenceId?: string | null
  // Tracking link token (from /v1/deliveries/token/{id})
  token?: string | null
  url?: string | null
  // Addresses
  pickup?: Record<string, unknown> | null
  dropoff?: Record<string, unknown> | null
  recipient?: Record<string, unknown> | null
  // Package/weight info
  items?: Array<Record<string, unknown>> | null
  // Cost
  price?: number | null
  currency?: string | null
  // Timestamps
  lastStatusDate?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapTaskStatus(status: number | string | null | undefined): ShipmentStatus {
  // Shippify uses numeric status codes; _status is the human name
  const s = String(status ?? '').toLowerCase()
  switch (s) {
    case '0':
    case 'pending':
    case 'created':
    case 'new':       return 'PENDING'
    case '1':
    case 'assigned':
    case 'accepted':  return 'IN_TRANSIT'
    case '2':
    case 'picked_up':
    case 'in_transit': return 'IN_TRANSIT'
    case '3':
    case 'delivered':  return 'DELIVERED'
    case '4':
    case 'cancelled':
    case 'canceled':   return 'CANCELLED'
    case '5':
    case 'failed':
    case 'returned':   return 'RETURNED'
    default:           return 'UNKNOWN'
  }
}

export function transformTask(raw: ShippifyTask): Shipment {
  // Prefer _status (human name) over numeric status for mapping
  const statusVal = raw._status ?? raw.status
  // Pickup address may be nested under pickup.location or pickup directly
  const pickupRaw = raw.pickup as Record<string, unknown> | null | undefined
  const pickupLocation = (pickupRaw?.location as Record<string, unknown> | null | undefined) ?? pickupRaw
  // Dropoff address may be nested under dropoff.location or dropoff directly
  const dropoffRaw = raw.dropoff as Record<string, unknown> | null | undefined
  const dropoffLocation = (dropoffRaw?.location as Record<string, unknown> | null | undefined) ?? dropoffRaw
  // Recipient contact for destination address
  const recipientRaw = raw.recipient as Record<string, unknown> | null | undefined
  const destinationAddr = dropoffLocation
    ? {
        ...dropoffLocation,
        name: recipientRaw?.name ?? dropoffLocation?.name,
        email: recipientRaw?.email ?? dropoffLocation?.email,
        phone: recipientRaw?.phone ?? dropoffLocation?.phone,
      }
    : undefined

  return {
    id: raw.id ?? undefined,
    status: mapTaskStatus(statusVal),
    trackingNumber: raw.token ?? undefined,
    reference: raw.referenceId ?? undefined,
    labelUrl: raw.url ?? undefined,
    originAddress: toAddress(pickupLocation as Record<string, unknown> | null | undefined),
    destinationAddress: toAddress(destinationAddr as Record<string, unknown> | null | undefined),
    totalWeight: toWeight(
      (raw.items as Array<Record<string, unknown>> | null | undefined)?.[0]?.['weight'],
      'kg',
    ),
    cost:
      raw.price != null
        ? {
            amount: raw.price,
            currency: (raw.currency ?? 'USD') as string,
          }
        : undefined,
    createdAt: toISODate(raw.created_at ?? raw.lastStatusDate),
    updatedAt: toISODate(raw.updated_at ?? raw.lastStatusDate),
    metadata: raw as Record<string, unknown>,
  }
}
