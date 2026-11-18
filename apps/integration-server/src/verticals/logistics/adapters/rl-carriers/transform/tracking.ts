import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

/**
 * A single tracing event within an R+L Carriers ShipmentTracing response.
 * R+L returns event descriptions as free-form strings; no formal status codes.
 */
export interface RlCarriersTracingEvent {
  StatusCode?: string
  StatusDescription?: string
  EventDateTime?: string
  EventDate?: string
  EventTime?: string
  City?: string
  State?: string
  Zip?: string
  [key: string]: unknown
}

/**
 * The ShipmentTracing response from R+L Carriers REST API.
 * GET /ShipmentTracing?request.traceNumbers={number}&request.traceType={type}
 */
export interface RlCarriersTracingResult {
  ProNumber?: string
  PickupNumber?: string
  BolNumber?: string
  ShipmentStatus?: string
  ShipmentStatusDescription?: string
  EstimatedDeliveryDate?: string
  DeliveredDate?: string
  Consignee?: {
    City?: string
    State?: string
    Zip?: string
    [key: string]: unknown
  }
  Shipper?: {
    City?: string
    State?: string
    Zip?: string
    [key: string]: unknown
  }
  Events?: RlCarriersTracingEvent[]
  [key: string]: unknown
}

export interface RlCarriersTracingResponse {
  ServiceResponse?: {
    TraceResults?: RlCarriersTracingResult[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

function mapStatus(description: string | undefined): TrackingEventStatus {
  if (!description) return 'UNKNOWN'
  const key = description.toLowerCase()
  // exact match first
  if (key in TRACKING_STATUS_MAP) {
    return (TRACKING_STATUS_MAP[key] as TrackingEventStatus) ?? 'UNKNOWN'
  }
  // partial match
  for (const [pattern, status] of Object.entries(TRACKING_STATUS_MAP)) {
    if (key.includes(pattern)) {
      return (status as TrackingEventStatus) ?? 'UNKNOWN'
    }
  }
  return 'UNKNOWN'
}

function toLocation(
  city?: string,
  state?: string,
  postalCode?: string,
): Address | undefined {
  if (!city && !state && !postalCode) return undefined
  return {
    city: city ?? undefined,
    state: state ?? undefined,
    postalCode: postalCode ?? undefined,
    country: 'US',
  }
}

function eventDateTime(evt: RlCarriersTracingEvent): Date | undefined {
  if (evt.EventDateTime) return toISODate(evt.EventDateTime)
  if (evt.EventDate) {
    const combined = evt.EventTime ? `${evt.EventDate}T${evt.EventTime}` : evt.EventDate
    return toISODate(combined)
  }
  return undefined
}

export function transformTrackingEvents(
  raw: RlCarriersTracingResponse,
  trackingNumber: string,
): TrackingEvent[] {
  const results = raw.ServiceResponse?.TraceResults ?? []

  const allEvents: TrackingEvent[] = []

  for (const result of results) {
    const proNumber = result.ProNumber ?? trackingNumber

    const events = result.Events ?? []

    if (events.length > 0) {
      for (const evt of events) {
        allEvents.push({
          trackingNumber: proNumber,
          carrierId: 'rl-carriers',
          status: mapStatus(evt.StatusDescription ?? evt.StatusCode),
          description: evt.StatusDescription ?? evt.StatusCode ?? undefined,
          location: toLocation(evt.City, evt.State, evt.Zip),
          occurredAt: eventDateTime(evt),
          metadata: raw as Record<string, unknown>,
        })
      }
    } else {
      // No event details — synthesise one from the shipment-level status
      allEvents.push({
        trackingNumber: proNumber,
        carrierId: 'rl-carriers',
        status: mapStatus(result.ShipmentStatusDescription ?? result.ShipmentStatus),
        description: result.ShipmentStatusDescription ?? result.ShipmentStatus ?? undefined,
        occurredAt: toISODate(result.DeliveredDate ?? result.EstimatedDeliveryDate),
        metadata: raw as Record<string, unknown>,
      })
    }
  }

  if (allEvents.length === 0) {
    allEvents.push({
      trackingNumber,
      carrierId: 'rl-carriers',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return allEvents
}
