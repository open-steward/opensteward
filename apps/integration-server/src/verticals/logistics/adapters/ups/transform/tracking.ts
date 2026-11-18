import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { UPS_TRACKING_STATUS_MAP } from '../constants'

export interface UPSTrackingActivity {
  date?: string      // YYYYMMDD
  time?: string      // HHMMSS
  location?: {
    address?: {
      city?: string
      stateProvince?: string
      countryCode?: string
    }
  }
  status?: {
    type?: string
    code?: string
    description?: string
  }
}

export interface UPSTrackingPackage {
  trackingNumber: string
  activity?: UPSTrackingActivity[]
  currentStatus?: {
    type?: string
    code?: string
    description?: string
  }
  deliveryDate?: Array<{ date?: string }>
  [key: string]: unknown
}

export interface UPSTrackResponse {
  trackResponse: {
    shipment: Array<{
      package: UPSTrackingPackage[]
      [key: string]: unknown
    }>
  }
}

function mapTrackingStatus(statusType: string | undefined): TrackingEventStatus {
  if (!statusType) return 'UNKNOWN'
  return (UPS_TRACKING_STATUS_MAP[statusType] as TrackingEventStatus) ?? 'UNKNOWN'
}

function parseUPSDateTime(date?: string, time?: string): Date | undefined {
  if (!date) return undefined
  // date = YYYYMMDD, time = HHMMSS
  const y = date.substring(0, 4)
  const m = date.substring(4, 6)
  const d = date.substring(6, 8)
  if (!time) return new Date(`${y}-${m}-${d}T00:00:00Z`)
  const hh = time.substring(0, 2)
  const mm = time.substring(2, 4)
  const ss = time.substring(4, 6)
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`)
}

function toTrackingLocation(activity: UPSTrackingActivity): Address | undefined {
  const addr = activity.location?.address
  if (!addr) return undefined
  const hasAny = addr.city || addr.stateProvince || addr.countryCode
  if (!hasAny) return undefined
  return {
    city: addr.city ?? undefined,
    state: addr.stateProvince ?? undefined,
    country: addr.countryCode ?? undefined,
  }
}

export function transformTrackingPackage(raw: UPSTrackingPackage): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.activity ?? []).map((activity) => ({
    trackingNumber: raw.trackingNumber,
    carrierId: 'UPS',
    status: mapTrackingStatus(activity.status?.type),
    description: activity.status?.description ?? undefined,
    location: toTrackingLocation(activity),
    occurredAt: parseUPSDateTime(activity.date, activity.time),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.trackingNumber,
      carrierId: 'UPS',
      status: mapTrackingStatus(raw.currentStatus?.type),
      description: raw.currentStatus?.description ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
