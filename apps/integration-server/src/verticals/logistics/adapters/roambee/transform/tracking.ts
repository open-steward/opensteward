import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

/**
 * One item of POST /shipment/alerts ("Get Alert for Shipment"),
 * https://docs.decklar.com/: "It returns a list of all alerts for the
 * shipment. Each item in the list contains all information pertaining to an
 * alert." Schema: event, short_message, reported_on ("Timestamp in Unix Epoch
 * format"; example 1613062538, epoch seconds), address, data.
 */
export interface RoambeeAlert {
  event?: string
  short_message?: string
  reported_on?: number
  address?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

// The event values the docs show, with the short_message beside each:
//   SHIPMENTSTART "Shipment has departed its origin"
//   MOVING        "<imei> is moving"
// Anything else is UNKNOWN until documented.
const STATUS_MAP: Record<string, TrackingEventStatus> = {
  SHIPMENTSTART: 'IN_TRANSIT',
  MOVING: 'IN_TRANSIT',
}

/**
 * The alerts of shipment `shipmentUuid`, in response order. Each id is the
 * shipment uuid, reported_on and event; a repeat of all three within one
 * shipment gets `#<n>` so ids stay unique and stable for the same response.
 */
export function transformAlerts(shipmentUuid: string, alerts: RoambeeAlert[]): TrackingEvent[] {
  const seen = new Map<string, number>()
  return alerts.map((a) => {
    const base = `${shipmentUuid}:${a.reported_on ?? ''}:${a.event ?? ''}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return {
      id: n === 0 ? base : `${base}#${n}`,
      shipmentId: shipmentUuid,
      status: (a.event !== undefined ? STATUS_MAP[a.event] : undefined) ?? 'UNKNOWN',
      description: a.short_message ?? undefined,
      location: a.address ? { street1: a.address } : undefined,
      occurredAt:
        typeof a.reported_on === 'number' && a.reported_on > 0
          ? new Date(a.reported_on * 1000)
          : undefined,
      metadata: a,
    }
  })
}
