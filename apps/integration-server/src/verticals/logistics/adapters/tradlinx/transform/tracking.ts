import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP, TRACKING_STATUS_MAP } from '../constants'

export interface TradlinxShipment {
  id?: string
  status?: string
  trackingNumber?: string
  containerNumber?: string
  containerType?: string
  bookingNumber?: string
  billOfLadingNumber?: string
  vesselName?: string
  voyageNumber?: string
  shippingLine?: string
  portOfLoading?: string
  portOfDischarge?: string
  estimatedDeparture?: string
  estimatedArrival?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface TradlinxEvent {
  id?: string
  status?: string
  description?: string
  location?: string
  occurredAt?: string
  [key: string]: unknown
}

export interface TradlinxEventsResponse {
  events?: TradlinxEvent[]
  [key: string]: unknown
}

function mapShipmentStatus(code: string | undefined): ShipmentStatus {
  if (!code) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[code] as ShipmentStatus) ?? 'UNKNOWN'
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

export function transformShipment(raw: TradlinxShipment): Shipment {
  const ocean: OceanFields = {
    containerNumber: raw.containerNumber ?? undefined,
    containerType: raw.containerType ?? undefined,
    bookingNumber: raw.bookingNumber ?? undefined,
    billOfLadingNumber: raw.billOfLadingNumber ?? undefined,
    vesselName: raw.vesselName ?? undefined,
    voyageNumber: raw.voyageNumber ?? undefined,
    shippingLine: raw.shippingLine ?? undefined,
    portOfLoading: raw.portOfLoading ?? undefined,
    portOfDischarge: raw.portOfDischarge ?? undefined,
    estimatedDeparture: toISODate(raw.estimatedDeparture),
    estimatedArrival: toISODate(raw.estimatedArrival),
  }

  const hasOceanData = Object.values(ocean).some((v) => v !== undefined)

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    mode: 'ocean',
    ocean: hasOceanData ? ocean : undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformTrackingEvents(
  shipmentId: string,
  raw: TradlinxEventsResponse,
): TrackingEvent[] {
  return (raw.events ?? []).map((evt) => ({
    shipmentId,
    id: evt.id ?? undefined,
    status: mapTrackingStatus(evt.status),
    description: evt.description ?? undefined,
    location: evt.location ? { street1: evt.location } : undefined,
    occurredAt: toISODate(evt.occurredAt),
    metadata: evt as Record<string, unknown>,
  }))
}
