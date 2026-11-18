import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { STOP_STATE_MAP } from '../constants'
import type { SamsaraRoute, SamsaraRouteStop, SamsaraAddress } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapStopStatus(state: string | undefined): TrackingEventStatus {
  if (!state) return 'UNKNOWN'
  return (STOP_STATE_MAP[state] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(addr: SamsaraAddress | undefined): Address | undefined {
  if (!addr) return undefined
  const hasAny = addr.city ?? addr.state ?? addr.postalCode ?? addr.country ?? addr.addressLine1
  if (!hasAny) return undefined
  return {
    name: addr.name ?? undefined,
    street1: addr.addressLine1 ?? addr.formattedAddress ?? undefined,
    street2: addr.addressLine2 ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    postalCode: addr.postalCode ?? undefined,
    country: (addr.country as Address['country']) ?? undefined,
  }
}

function stopDescription(stop: SamsaraRouteStop): string | undefined {
  const parts: string[] = []
  if (stop.name) parts.push(stop.name)
  if (stop.state) parts.push(`State: ${stop.state}`)
  return parts.length > 0 ? parts.join(' — ') : undefined
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformRouteTrackingEvents(raw: SamsaraRoute): TrackingEvent[] {
  // trackingNumber surrogate: first externalId value or route id
  const externalIdValues = raw.externalIds ? Object.values(raw.externalIds) : []
  const trackingNumber = externalIdValues[0] ?? raw.id ?? undefined

  const stops = raw.stops ?? []

  const events: TrackingEvent[] = stops.map((stop) => {
    // The most recent time we have for this stop
    const occurredAt =
      toISODate(stop.actualDepartureTime) ??
      toISODate(stop.actualArrivalTime) ??
      toISODate(stop.scheduledArrivalTime)

    return {
      shipmentId: raw.id ?? undefined,
      trackingNumber,
      carrierId: 'samsara',
      status: mapStopStatus(stop.state),
      description: stopDescription(stop),
      location: toLocation(stop.address),
      occurredAt,
      metadata: { route: raw, stop } as Record<string, unknown>,
    }
  })

  // If no stops, emit a single route-level event
  if (events.length === 0) {
    const occurredAt =
      toISODate(raw.actualStartTime) ?? toISODate(raw.scheduledStartTime) ?? undefined

    let status: TrackingEventStatus = 'UNKNOWN'
    if (raw.state === 'completed') status = 'DELIVERED'
    else if (raw.state === 'en_route') status = 'IN_TRANSIT'
    else if (raw.state === 'unstarted') status = 'PRE_TRANSIT'

    events.push({
      shipmentId: raw.id ?? undefined,
      trackingNumber,
      carrierId: 'samsara',
      status,
      description: raw.name ?? undefined,
      occurredAt,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
