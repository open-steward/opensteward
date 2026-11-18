import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { TRACKING_STATUS_MAP } from '../constants'

export interface FareyeLocation {
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface FareyeTrackingUpdate {
  timestamp: string
  status: string
  description?: string
  location?: FareyeLocation
  [key: string]: unknown
}

export interface FareyeShipmentTrackingResponse {
  shipmentId: string
  trackingNumber?: string
  carrierId?: string
  currentStatus?: string
  currentStatusDescription?: string
  updates?: FareyeTrackingUpdate[]
  [key: string]: unknown
}

export interface FareyeTrackingListResponse {
  shipments: FareyeShipmentTrackingResponse[]
  totalCount?: number
  [key: string]: unknown
}

function mapStatus(raw: string | undefined): TrackingEventStatus {
  if (!raw) return 'UNKNOWN'
  const upper = raw.toUpperCase().replace(/\s+/g, '_')
  return (TRACKING_STATUS_MAP[upper] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toAddress(loc: FareyeLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.state || loc.postalCode || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.city ?? undefined,
    state: loc.state ?? undefined,
    postalCode: loc.postalCode ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(raw: FareyeShipmentTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.trackingNumber ?? raw.shipmentId

  const updates = raw.updates ?? []

  if (updates.length > 0) {
    return updates.map((update) => ({
      trackingNumber,
      carrierId: raw.carrierId ?? 'fareye',
      status: mapStatus(update.status),
      description: update.description ?? undefined,
      location: toAddress(update.location),
      occurredAt: update.timestamp ? new Date(update.timestamp) : undefined,
      metadata: raw as Record<string, unknown>,
    }))
  }

  return [
    {
      trackingNumber,
      carrierId: raw.carrierId ?? 'fareye',
      status: mapStatus(raw.currentStatus),
      description: raw.currentStatusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
