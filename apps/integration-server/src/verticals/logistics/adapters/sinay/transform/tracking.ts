import { toIsoDatetime } from '@opensteward/shared'
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { SinayShipmentResponse, SinayContainerEvent } from './shipment'

// ─── Status mapping ───────────────────────────────────────────────────────────

export function mapTrackingStatus(
  eventCode: string | null | undefined,
  eventType: string | null | undefined,
  status: string | null | undefined,
): TrackingEventStatus {
  const raw = (eventCode ?? eventType ?? status ?? '').toUpperCase()
  if (!raw) return 'UNKNOWN'

  // Delivery / arrival
  if (raw.includes('DELIV') || raw === 'GATE_OUT_DEST' || raw.includes('GATE-OUT-DEST')) return 'DELIVERED'

  // Gate-out at origin / empty return → pre-transit
  if (raw.includes('GATE_OUT') || raw.includes('GATE-OUT') || raw.includes('EMPTY_RETURN')) return 'PRE_TRANSIT'

  // Load, depart, on vessel
  if (
    raw.includes('LOAD') ||
    raw.includes('DEPART') ||
    raw.includes('DISCHARG') ||
    raw.includes('ARRIV') ||
    raw.includes('TRANSIT') ||
    raw.includes('VESSEL') ||
    raw.includes('SEA') ||
    raw === 'IN_TRANSIT'
  )
    return 'IN_TRANSIT'

  // Gate-in at destination terminal
  if (raw.includes('GATE_IN') || raw.includes('GATE-IN')) return 'OUT_FOR_DELIVERY'

  // Exceptions
  if (raw.includes('EXCEPTION') || raw.includes('FAIL') || raw.includes('ERROR')) return 'FAILURE'

  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

function transformContainerEvents(
  containerNumber: string | null | undefined,
  events: SinayContainerEvent[],
  carrierId: string,
): TrackingEvent[] {
  return events.map((evt) => ({
    trackingNumber: containerNumber ?? undefined,
    carrierId,
    status: mapTrackingStatus(evt.eventCode, evt.eventType, evt.status),
    description: evt.description ?? evt.eventType ?? undefined,
    location: evt.location
      ? {
          city: evt.location.name ?? undefined,
          country: evt.location.country ?? undefined,
          postalCode: evt.location.locode ?? undefined,
        }
      : undefined,
    occurredAt: toIsoDatetime(evt.date) ? new Date(toIsoDatetime(evt.date)!) : undefined,
    metadata: evt as Record<string, unknown>,
  }))
}

/**
 * Transform a GET /shipment response into canonical TrackingEvents.
 *
 * The Sinay response nests events inside each container.  We flatten all
 * container events into a single sorted list.
 */
export function transformTracking(raw: SinayShipmentResponse): TrackingEvent[] {
  const containers = raw.containers ?? []
  const carrierId = 'sinay'

  if (containers.length === 0) {
    // No container detail yet — emit a single stub event
    return [
      {
        trackingNumber: raw.shipmentNumber ?? undefined,
        carrierId,
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  const events: TrackingEvent[] = containers.flatMap((container) =>
    transformContainerEvents(container.number ?? raw.shipmentNumber, container.events ?? [], carrierId),
  )

  if (events.length === 0) {
    return [
      {
        trackingNumber: raw.shipmentNumber ?? containers[0]?.number ?? undefined,
        carrierId,
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  // Sort chronologically (earliest first); unknown dates go last
  return events.sort((a, b) => {
    const ta = a.occurredAt?.getTime() ?? Infinity
    const tb = b.occurredAt?.getTime() ?? Infinity
    return ta - tb
  })
}
