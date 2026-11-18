import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface DHLTrackingEvent {
  date: string | null
  time: string | null
  typeCode: string | null
  description: string | null
  serviceArea: { code: string; description: string }[] | null
}

export interface DHLTrackingShipment {
  shipmentTrackingNumber: string
  status: string | null
  shipmentTimestamp: string | null
  estimatedDeliveryDate: string | null
  events: DHLTrackingEvent[]
  numberOfPieces: number | null
  [key: string]: unknown
}

export interface DHLTrackingResponse {
  shipments: DHLTrackingShipment[]
}

/**
 * Map DHL tracking typeCode to canonical TrackingEventStatus.
 */
function mapTrackingTypeCode(typeCode: string | null | undefined): TrackingEventStatus {
  switch (typeCode) {
    case 'PU':   // picked up
    case 'PL':   // processed at location
    case 'AF':   // arrived at facility
    case 'DF':   // departed facility
    case 'TP':   // in transit
    case 'CC':   // customs clearance
    case 'CR':   // customs release
      return 'IN_TRANSIT'
    case 'WC':   // with delivery courier
      return 'OUT_FOR_DELIVERY'
    case 'OK':   // delivered
      return 'DELIVERED'
    case 'RR':   // return to sender
      return 'RETURN_TO_SENDER'
    case 'DD':   // delivery delay
    case 'OH':   // on hold
    case 'NH':   // delivery attempt failed
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Combine date + time strings from DHL events into a single ISO timestamp.
 */
function combineDateAndTime(date: string | null, time: string | null): string | null {
  if (!date) return null
  if (!time) return date
  return `${date}T${time}`
}

function eventLocation(serviceArea: DHLTrackingEvent['serviceArea']) {
  if (!serviceArea || serviceArea.length === 0) return undefined
  const area = serviceArea[0]
  if (!area.description && !area.code) return undefined
  return {
    city: area.description ?? undefined,
    state: undefined,
    country: area.code ?? undefined,
  }
}

export function transformTracking(
  raw: DHLTrackingShipment,
  trackingNumber?: string,
): TrackingEvent[] {
  const tn = trackingNumber ?? raw.shipmentTrackingNumber

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: tn,
    carrierId: 'dhl',
    status: mapTrackingTypeCode(evt.typeCode),
    description: evt.description ?? undefined,
    location: eventLocation(evt.serviceArea),
    occurredAt: toISODate(combineDateAndTime(evt.date, evt.time)),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: tn,
      carrierId: 'dhl',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
