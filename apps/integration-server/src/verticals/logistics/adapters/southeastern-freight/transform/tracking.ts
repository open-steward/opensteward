/**
 * Transform SEFL tracing API responses → canonical TrackingEvent[].
 *
 * Tracing endpoint: GET https://www.sefl.com/webconnect/tracing
 *   ?Type=PN&RefNum1={proNumber}&output=JSON
 *   (optionally with &Username=…&Password=… for full event list)
 *
 * JSON response structure (inferred from SEFL Web Connect docs + typical LTL patterns):
 * {
 *   shipment: {
 *     proNumber: string
 *     status: string               // e.g. "Delivered"
 *     statusDescription: string
 *     deliveredDate?: string
 *     estimatedDeliveryDate?: string
 *     origin?: { city, state, zip }
 *     destination?: { city, state, zip }
 *     shipper?: string
 *     consignee?: string
 *     events?: Array<{
 *       dateTime: string
 *       status: string
 *       description: string
 *       city?: string
 *       state?: string
 *       zip?: string
 *     }>
 *   }
 * }
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { TRACKING_STATUS_MAP } from '../constants'

export interface SeflTrackingEventRaw {
  dateTime?: string
  date?: string
  time?: string
  status?: string
  description?: string
  city?: string
  state?: string
  zip?: string
  [key: string]: unknown
}

export interface SeflTracingShipment {
  proNumber?: string
  status?: string
  statusDescription?: string
  deliveredDate?: string
  estimatedDeliveryDate?: string
  events?: SeflTrackingEventRaw[]
  [key: string]: unknown
}

export interface SeflTracingResponse {
  shipment?: SeflTracingShipment
  proNumber?: string
  status?: string
  statusDescription?: string
  events?: SeflTrackingEventRaw[]
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): TrackingEventStatus {
  if (!raw) return 'UNKNOWN'
  // Exact match first
  if (raw in TRACKING_STATUS_MAP) {
    return (TRACKING_STATUS_MAP[raw] as TrackingEventStatus) ?? 'UNKNOWN'
  }
  // Case-insensitive partial match
  const upper = raw.toUpperCase()
  for (const [key, val] of Object.entries(TRACKING_STATUS_MAP)) {
    if (upper.includes(key.toUpperCase())) {
      return (val as TrackingEventStatus) ?? 'UNKNOWN'
    }
  }
  return 'UNKNOWN'
}

function eventLocation(evt: SeflTrackingEventRaw): Address | undefined {
  const hasAny = evt.city ?? evt.state ?? evt.zip
  if (!hasAny) return undefined
  return {
    city: evt.city ?? undefined,
    state: evt.state ?? undefined,
    postalCode: evt.zip ?? undefined,
    country: 'US',
  }
}

function parseEventDate(evt: SeflTrackingEventRaw): Date | undefined {
  // Try combined dateTime field first
  if (evt.dateTime) {
    const s = toIsoDatetime(evt.dateTime)
    return s ? new Date(s) : undefined
  }
  // Fall back to separate date + time
  if (evt.date) {
    const combined = evt.time ? `${evt.date}T${evt.time}` : evt.date
    const s = toIsoDatetime(combined)
    return s ? new Date(s) : undefined
  }
  return undefined
}

export function transformTrackingEvents(raw: SeflTracingResponse): TrackingEvent[] {
  // Support both top-level and nested `shipment` envelope
  const shipment: SeflTracingShipment = raw.shipment ?? raw
  const proNumber = shipment.proNumber ?? (raw.proNumber as string | undefined) ?? undefined

  const rawEvents: SeflTrackingEventRaw[] = shipment.events ?? []

  const events: TrackingEvent[] = rawEvents.map((evt) => ({
    trackingNumber: proNumber,
    carrierId: 'southeastern-freight',
    status: mapStatus(evt.status),
    description: evt.description ?? evt.status ?? undefined,
    location: eventLocation(evt),
    occurredAt: parseEventDate(evt),
    metadata: raw as Record<string, unknown>,
  }))

  // When no events returned, synthesise a single event from the top-level status
  if (events.length === 0) {
    events.push({
      trackingNumber: proNumber,
      carrierId: 'southeastern-freight',
      status: mapStatus(shipment.status),
      description: shipment.statusDescription ?? shipment.status ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
