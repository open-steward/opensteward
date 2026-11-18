import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'
import type { Route4MeAddress } from './shipment'

/**
 * A single destination stop within a solved Route4Me route.
 * When fetched from GET /routes/{route_id} each address entry represents a
 * visit and carries timestamped status information.
 */
export interface Route4MeRouteDestination {
  route_destination_id?: string | null
  route_id?: string | null
  /** Timestamp when the driver checked in */
  timestamp_last_visited?: number | null
  /** Timestamp when the driver checked out */
  timestamp_last_departed?: number | null
  /** Visit status */
  is_visited?: boolean | null
  is_departed?: boolean | null
  is_accepted?: boolean | null
  alias?: string | null
  first_name?: string | null
  last_name?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  country_id?: string | null
  zip?: string | null
  lat?: number | null
  lng?: number | null
  is_depot?: boolean | null
  notes?: Route4MeNote[] | null
  [key: string]: unknown
}

export interface Route4MeNote {
  note_id?: string | null
  route_destination_id?: string | null
  note?: string | null
  created_at?: number | null
  [key: string]: unknown
}

function mapDestinationStatus(
  dest: Route4MeRouteDestination,
): TrackingEventStatus {
  if (dest.is_visited) return 'DELIVERED'
  if (dest.is_departed) return 'OUT_FOR_DELIVERY'
  if (dest.is_accepted) return 'IN_TRANSIT'
  return 'PRE_TRANSIT'
}

export function transformTrackingEvents(
  destinations: Route4MeRouteDestination[],
  routeId: string,
): TrackingEvent[] {
  return destinations
    .filter((d) => !d.is_depot)
    .map((dest): TrackingEvent => {
      const addressRaw: Route4MeAddress = {
        address: dest.address ?? undefined,
        alias: dest.alias ?? undefined,
        first_name: dest.first_name ?? undefined,
        last_name: dest.last_name ?? undefined,
        city: dest.city ?? undefined,
        state: dest.state ?? undefined,
        country_id: dest.country_id ?? undefined,
        zip: dest.zip ?? undefined,
      }

      return {
        id: dest.route_destination_id ?? undefined,
        shipmentId: routeId,
        trackingNumber: routeId,
        carrierId: 'route4me',
        status: mapDestinationStatus(dest),
        description: dest.notes?.[0]?.note ?? undefined,
        location: toAddress({
          address1: addressRaw.address,
          name: [dest.first_name, dest.last_name].filter(Boolean).join(' ') || dest.alias,
          city: dest.city,
          state: dest.state,
          country_code: dest.country_id,
          zip: dest.zip,
        }),
        occurredAt:
          toISODate(dest.timestamp_last_visited) ??
          toISODate(dest.timestamp_last_departed) ??
          undefined,
        metadata: dest as Record<string, unknown>,
      }
    })
}
