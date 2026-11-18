import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface MagayaTrackingEvent {
  Status?: string | null
  Description?: string | null
  EventDate?: string | null
  Location?: string | null
  City?: string | null
  State?: string | null
  Country?: string | null
  PostalCode?: string | null
  [key: string]: unknown
}

export interface MagayaShipmentTracking {
  ShipmentID?: string | number | null
  TrackingNumber?: string | null
  HouseAirwayBill?: string | null
  MasterBill?: string | null
  Events?: MagayaTrackingEvent[]
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[status] as TrackingEventStatus) ?? 'UNKNOWN'
}

export function transformTracking(raw: MagayaShipmentTracking): TrackingEvent[] {
  const trackingNumber =
    raw.TrackingNumber ?? raw.HouseAirwayBill ?? raw.MasterBill ?? undefined
  const shipmentId = raw.ShipmentID != null ? String(raw.ShipmentID) : undefined

  const events = raw.Events ?? []
  if (events.length === 0) {
    return [
      {
        shipmentId,
        trackingNumber: trackingNumber ?? undefined,
        carrierId: 'magaya',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: 'magaya',
    status: mapStatus(evt.Status),
    description: evt.Description ?? undefined,
    location:
      evt.City || evt.State || evt.Country || evt.PostalCode
        ? {
            city: evt.City ?? undefined,
            state: evt.State ?? undefined,
            country: evt.Country ?? undefined,
            postalCode: evt.PostalCode ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(evt.EventDate),
    metadata: evt as Record<string, unknown>,
  }))
}
