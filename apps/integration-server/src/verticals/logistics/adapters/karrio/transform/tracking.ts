import { createHash } from 'node:crypto'
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

/**
 * A Karrio tracker (`TrackingStatus`) and its events (`TrackingEvent`), from
 * GET /v1/trackers and GET /v1/trackers/{id_or_tracking_number}.
 *
 * Reference 2024.12.6 (https://docs.karrio.io/reference/openapi) documents an
 * event as date ("Format: `YYYY-MM-DD`"), time ("Format: `HH:MM AM/PM`"),
 * description, location (a free-form string), code ("The tracking event's
 * code"), latitude and longitude. The current schema, 2026.1.32
 * (https://raw.githubusercontent.com/karrioapi/karrio/main/schemas/openapi.yml),
 * adds timestamp ("Format: `YYYY-MM-DDTHH:MM:SS.sssZ` (ISO 8601)") and status
 * ("The normalized status of this specific event"). Instances are self-hosted
 * and run either, so both of those are optional here.
 */
export interface KarrioTrackingEvent {
  date?: string | null
  time?: string | null
  timestamp?: string | null
  status?: string | null
  description?: string | null
  location?: string | null
  code?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface KarrioTracker {
  id?: string
  carrier_name: string
  carrier_id: string
  tracking_number: string
  events?: KarrioTrackingEvent[] | null
}

/**
 * The documented per-event `status` enum (2026.1.32): pending, picked_up,
 * unknown, on_hold, cancelled, delivered, in_transit, delivery_delayed,
 * out_for_delivery, ready_for_pickup, delivery_failed, return_to_sender.
 */
function mapEventStatus(status: string | null | undefined): TrackingEventStatus | undefined {
  switch (status) {
    case undefined:
    case null:
    case '':
      return undefined
    case 'pending':
      return 'PRE_TRANSIT'
    case 'picked_up':
    case 'in_transit':
    case 'delivery_delayed':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'ready_for_pickup':
      return 'AVAILABLE_FOR_PICKUP'
    case 'return_to_sender':
      return 'RETURN_TO_SENDER'
    case 'delivery_failed':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Karrio events carry no id. This one is built from the tracker's carrier and
 * tracking number plus the event's own documented fields, so the same event
 * has the same id on every read, whatever its position in the list.
 */
function eventId(raw: KarrioTracker, evt: KarrioTrackingEvent): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        evt.timestamp ?? null,
        evt.date ?? null,
        evt.time ?? null,
        evt.code ?? null,
        evt.status ?? null,
        evt.description ?? null,
        evt.location ?? null,
      ]),
    )
    .digest('hex')
    .slice(0, 16)
  return `${raw.carrier_name}:${raw.tracking_number}:${digest}`
}

/**
 * One canonical event per documented tracker event. A tracker with no events
 * yields none: its current `status` is not an event.
 *
 * `occurredAt` comes only from the ISO 8601 `timestamp`. `date` + `time`
 * ("HH:MM AM/PM") carry no time zone, so they stay in metadata rather than
 * become an instant. `location` is a free-form string, kept in metadata rather
 * than split into address parts.
 */
export function transformTracker(raw: KarrioTracker): TrackingEvent[] {
  return (raw.events ?? []).map((evt) => {
    const status = mapEventStatus(evt.status)
    const occurredAt = evt.timestamp ? toISODate(evt.timestamp) : undefined
    return {
      id: eventId(raw, evt),
      trackingNumber: raw.tracking_number,
      carrierId: raw.carrier_id,
      ...(status ? { status } : {}),
      description: evt.description ?? undefined,
      ...(occurredAt ? { occurredAt } : {}),
      metadata: {
        trackerId: raw.id,
        carrierName: raw.carrier_name,
        code: evt.code ?? undefined,
        date: evt.date ?? undefined,
        time: evt.time ?? undefined,
        location: evt.location ?? undefined,
        latitude: evt.latitude ?? undefined,
        longitude: evt.longitude ?? undefined,
      },
    }
  })
}
