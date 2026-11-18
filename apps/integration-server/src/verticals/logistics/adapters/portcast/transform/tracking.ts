import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Raw API types ────────────────────────────────────────────────────────────

export interface PortcastPort {
  UNLocationCode?: string | null
  name?: string | null
  city?: string | null
  country?: string | null
  [key: string]: unknown
}

export interface PortcastVessel {
  name?: string | null
  voyage_number?: string | null
  imo?: string | null
  [key: string]: unknown
}

export interface PortcastContainerEvent {
  event_type?: string | null
  description?: string | null
  actual_time?: string | null
  estimated_time?: string | null
  location?: PortcastPort | null
  vessel?: PortcastVessel | null
  [key: string]: unknown
}

export interface PortcastContainer {
  id?: string | null
  container_number?: string | null
  container_type?: string | null
  booking_number?: string | null
  bill_of_lading_number?: string | null
  carrier_no?: string | null
  carrier_name?: string | null
  status?: string | null
  pol?: PortcastPort | null
  pod?: PortcastPort | null
  vessel?: PortcastVessel | null
  voyage_number?: string | null
  estimated_arrival?: string | null
  actual_arrival?: string | null
  estimated_departure?: string | null
  actual_departure?: string | null
  events?: PortcastContainerEvent[]
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface PortcastListResponse {
  data?: PortcastContainer[]
  total?: number | null
  page?: number | null
  page_size?: number | null
  [key: string]: unknown
}

// ─── Status mappings ──────────────────────────────────────────────────────────

export function mapTrackingStatus(eventType: string | null | undefined): TrackingEventStatus {
  if (!eventType) return 'UNKNOWN'
  const t = eventType.toUpperCase()
  if (t.includes('GATE_OUT') || t.includes('GATE-OUT') || t.includes('EMPTY_RETURN')) return 'PRE_TRANSIT'
  if (t.includes('LOAD') || t.includes('DEPART') || t.includes('VESSEL_DEPARTURE')) return 'IN_TRANSIT'
  if (t.includes('ARRIV') || t.includes('VESSEL_ARRIVAL') || t.includes('DISCHARG')) return 'IN_TRANSIT'
  if (t.includes('GATE_IN') || t.includes('GATE-IN') || t.includes('PICKUP')) return 'OUT_FOR_DELIVERY'
  if (t.includes('DELIVER')) return 'DELIVERED'
  if (t.includes('FAIL') || t.includes('EXCEPTION') || t.includes('DELAY')) return 'FAILURE'
  return 'UNKNOWN'
}

export function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s === 'DELIVERED') return 'DELIVERED'
  if (s.includes('CANCEL')) return 'CANCELLED'
  if (s.includes('EXCEPTION') || s.includes('FAIL') || s.includes('DELAY')) return 'EXCEPTION'
  if (s.includes('TRANSIT') || s.includes('LOADED') || s.includes('DISCHARG') || s.includes('IN_TRANSIT')) return 'IN_TRANSIT'
  if (s.includes('BOOK') || s.includes('CREATED') || s.includes('PENDING')) return 'LABEL_CREATED'
  return 'UNKNOWN'
}

// ─── Transform functions ──────────────────────────────────────────────────────

function portCode(p: PortcastPort | null | undefined): string | undefined {
  if (!p) return undefined
  const v = p.UNLocationCode ?? p.name ?? p.city
  return v == null ? undefined : String(v)
}

export function transformTracking(raw: PortcastContainer): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [
      {
        trackingNumber: raw.container_number ?? undefined,
        carrierId: raw.carrier_no ?? 'portcast',
        status: mapTrackingStatus(raw.status),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }
  return events.map((evt) => {
    const timestamp = evt.actual_time ?? evt.estimated_time
    return {
      trackingNumber: raw.container_number ?? undefined,
      carrierId: raw.carrier_no ?? 'portcast',
      status: mapTrackingStatus(evt.event_type),
      description: evt.description ?? evt.event_type ?? undefined,
      location: evt.location
        ? {
            city: evt.location.city ?? evt.location.name ?? undefined,
            country: evt.location.country ?? undefined,
            postalCode: evt.location.UNLocationCode ?? undefined,
          }
        : undefined,
      occurredAt: toISODate(timestamp),
      metadata: evt as Record<string, unknown>,
    }
  })
}

export function transformShipment(raw: PortcastContainer): Shipment {
  const ocean: OceanFields = {
    containerNumber: raw.container_number ?? undefined,
    containerType: raw.container_type ?? undefined,
    bookingNumber: raw.booking_number ?? undefined,
    billOfLadingNumber: raw.bill_of_lading_number ?? undefined,
    vesselName: raw.vessel?.name ?? undefined,
    voyageNumber: raw.voyage_number ?? raw.vessel?.voyage_number ?? undefined,
    shippingLine: raw.carrier_name ?? undefined,
    portOfLoading: portCode(raw.pol),
    portOfDischarge: portCode(raw.pod),
    estimatedDeparture: toISODate(raw.estimated_departure),
    estimatedArrival: toISODate(raw.estimated_arrival),
    actualDeparture: toISODate(raw.actual_departure),
    actualArrival: toISODate(raw.actual_arrival),
  }

  return {
    id: raw.id ?? raw.container_number ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.container_number ?? undefined,
    carrierId: raw.carrier_no ?? 'portcast',
    originAddress: raw.pol
      ? {
          city: raw.pol.city ?? raw.pol.name ?? undefined,
          country: raw.pol.country ?? undefined,
          postalCode: raw.pol.UNLocationCode ?? undefined,
        }
      : undefined,
    destinationAddress: raw.pod
      ? {
          city: raw.pod.city ?? raw.pod.name ?? undefined,
          country: raw.pod.country ?? undefined,
          postalCode: raw.pod.UNLocationCode ?? undefined,
        }
      : undefined,
    reference: raw.bill_of_lading_number ?? raw.booking_number ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_arrival),
    actualDeliveryAt: toISODate(raw.actual_arrival),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    mode: 'ocean',
    ocean,
    metadata: raw as Record<string, unknown>,
  }
}
