import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── PostNL raw types ───────────────────────────────────────────────────────

export interface PostNLStatusEvent {
  TimeStamp: string
  StatusCode: string
  StatusDescription: string
  LocationCode: string | null
  DestinationLocationCode: string | null
  RouteCode: string | null
  RouteName: string | null
  [key: string]: unknown
}

export interface PostNLAddress {
  FirstName: string | null
  LastName: string | null
  CompanyName: string | null
  Street: string | null
  HouseNr: string | null
  HouseNrExt: string | null
  Zipcode: string | null
  City: string | null
  CountryCode: string | null
  [key: string]: unknown
}

export interface PostNLShipmentStatus {
  Barcode: string
  StatusCode: string
  Status: PostNLStatusEvent[]
  Addresses: PostNLAddress[] | null
  [key: string]: unknown
}

export interface PostNLTrackingResponse {
  CurrentStatus: PostNLShipmentStatus
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'Collected':        return 'PRE_TRANSIT'
    case 'InTransit':        return 'IN_TRANSIT'
    case 'Sorting':          return 'IN_TRANSIT'
    case 'Delivering':       return 'OUT_FOR_DELIVERY'
    case 'Delivered':        return 'DELIVERED'
    case 'ReturnToSender':   return 'RETURN_TO_SENDER'
    case 'DeliveryAttempt':  return 'FAILURE'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: PostNLTrackingResponse): TrackingEvent[] {
  const shipment = raw.CurrentStatus
  if (!shipment) return []

  const events: TrackingEvent[] = (shipment.Status ?? []).map((evt) => ({
    trackingNumber: shipment.Barcode ?? undefined,
    carrierId: 'postnl',
    status: mapTrackingStatus(evt.StatusCode),
    description: evt.StatusDescription || undefined,
    location: evt.RouteName
      ? { city: evt.RouteName }
      : undefined,
    occurredAt: toISODate(evt.TimeStamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: shipment.Barcode ?? undefined,
      carrierId: 'postnl',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
