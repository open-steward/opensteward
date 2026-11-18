import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { TerminalAfricaAddress } from './address'
import { transformAddress } from './address'

export interface TerminalAfricaTrackingStatus {
  status?: string | null
  sub_status?: string | null
  description?: string | null
  location?: TerminalAfricaAddress | null
  created_at?: string | null
  [key: string]: unknown
}

export interface TerminalAfricaTrackingEvent {
  status?: string | null
  description?: string | null
  location?: TerminalAfricaAddress | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface TerminalAfricaTrackingResponse {
  shipment_id?: string | null
  carrier_tracking_number?: string | null
  tracking_number?: string | null
  status?: string | null
  carrier?: string | null
  carrier_slug?: string | null
  tracking_status?: TerminalAfricaTrackingStatus | null
  events?: TerminalAfricaTrackingEvent[]
  delivery_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pre_transit':
    case 'pre-transit':
    case 'pending':
    case 'draft':             return 'PRE_TRANSIT'
    case 'in_transit':
    case 'in-transit':        return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'out-for-delivery':  return 'OUT_FOR_DELIVERY'
    case 'delivered':         return 'DELIVERED'
    case 'available_for_pickup':
    case 'available-for-pickup': return 'AVAILABLE_FOR_PICKUP'
    case 'return_to_sender':
    case 'returned':          return 'RETURN_TO_SENDER'
    case 'cancelled':
    case 'canceled':
    case 'failure':
    case 'exception':         return 'FAILURE'
    default:                  return 'UNKNOWN'
  }
}

export function transformTrackingEvents(raw: TerminalAfricaTrackingResponse): TrackingEvent[] {
  const events = raw.events ?? []
  const trackingNumber = raw.carrier_tracking_number ?? raw.tracking_number ?? undefined
  const carrierId = raw.carrier_slug ?? raw.carrier ?? undefined

  const mapped: TrackingEvent[] = events.map((ev) => ({
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: carrierId ?? undefined,
    status: mapTrackingStatus(ev.status),
    description: ev.description ?? undefined,
    location: ev.location ? transformAddress(ev.location) : undefined,
    occurredAt: toISODate(ev.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }))

  if (mapped.length === 0) {
    mapped.push({
      shipmentId: raw.shipment_id ?? undefined,
      trackingNumber: trackingNumber ?? undefined,
      carrierId: carrierId ?? undefined,
      status: mapTrackingStatus(raw.status ?? raw.tracking_status?.status),
      description: raw.tracking_status?.description ?? undefined,
      location:
        raw.tracking_status?.location
          ? transformAddress(raw.tracking_status.location)
          : undefined,
      occurredAt: toISODate(raw.tracking_status?.created_at ?? raw.updated_at),
      createdAt: toISODate(raw.created_at),
      metadata: raw as Record<string, unknown>,
    })
  }

  return mapped
}
