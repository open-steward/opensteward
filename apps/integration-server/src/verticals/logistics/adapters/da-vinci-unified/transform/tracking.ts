import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface DaVinciTrackingEvent {
  EventCode?: string | null
  EventDescription?: string | null
  EventDate?: string | null
  City?: string | null
  State?: string | null
  Country?: string | null
  PostalCode?: string | null
  [key: string]: unknown
}

export interface DaVinciTrackingResponse {
  ShipmentId?: string | number | null
  TrackingNumber?: string | null
  CarrierCode?: string | null
  Events?: DaVinciTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | null | undefined): TrackingEventStatus {
  const c = (code ?? '').toLowerCase()
  if (c.includes('pre_transit') || c.includes('label') || c.includes('created')) return 'PRE_TRANSIT'
  if (c.includes('out_for_delivery') || c.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (c.includes('delivered')) return 'DELIVERED'
  if (c.includes('pickup') || c.includes('available')) return 'AVAILABLE_FOR_PICKUP'
  if (c.includes('return') || c.includes('rts')) return 'RETURN_TO_SENDER'
  if (c.includes('exception') || c.includes('failure') || c.includes('error')) return 'FAILURE'
  if (c.includes('transit') || c.includes('in_transit') || c.includes('departed') || c.includes('arrived')) return 'IN_TRANSIT'
  return 'UNKNOWN'
}

export function transformTracking(raw: DaVinciTrackingResponse): TrackingEvent[] {
  const events = raw.Events ?? []
  const carrierId = raw.CarrierCode ?? 'da-vinci-unified'
  const shipmentId = raw.ShipmentId != null ? String(raw.ShipmentId) : undefined
  const trackingNumber = raw.TrackingNumber ?? undefined

  if (events.length === 0) {
    return [
      {
        shipmentId,
        trackingNumber,
        carrierId,
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId,
    trackingNumber,
    carrierId,
    status: mapTrackingStatus(evt.EventCode ?? evt.EventDescription),
    description: evt.EventDescription ?? undefined,
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
