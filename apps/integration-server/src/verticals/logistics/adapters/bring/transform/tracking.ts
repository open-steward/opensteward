import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Bring raw types ────────────────────────────────────────────────────────

export interface BringTrackingEvent {
  description: string | null
  status: string
  dateIso: string
  displayDate: string | null
  displayTime: string | null
  postalCode: string | null
  city: string | null
  country: string | null
  unitId: string | null
  [key: string]: unknown
}

export interface BringConsignment {
  consignmentId: string
  previousConsignmentId: string | null
  totalWeightInKgs: number | null
  totalVolumeInDm3: number | null
  packages: BringPackageTracking[]
  [key: string]: unknown
}

export interface BringPackageTracking {
  statusDescription: string | null
  descriptions: string[] | null
  packageNumber: string
  dateOfReturn: string | null
  dateOfEstimatedDelivery: string | null
  eventSet: BringTrackingEvent[]
  [key: string]: unknown
}

export interface BringTrackingResponse {
  consignmentSet: BringConsignment[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'HANDED_IN':        return 'PRE_TRANSIT'
    case 'IN_TRANSIT':       return 'IN_TRANSIT'
    case 'TERMINAL':         return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'DEVIATION':        return 'FAILURE'
    case 'RETURN':           return 'RETURN_TO_SENDER'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: BringTrackingResponse, trackingNumber: string): TrackingEvent[] {
  const events: TrackingEvent[] = []

  for (const consignment of raw.consignmentSet ?? []) {
    for (const pkg of consignment.packages ?? []) {
      for (const evt of pkg.eventSet ?? []) {
        events.push({
          trackingNumber: pkg.packageNumber || trackingNumber,
          carrierId: 'bring',
          status: mapTrackingStatus(evt.status),
          description: evt.description || undefined,
          location: evt.city
            ? {
                city: evt.city,
                postalCode: evt.postalCode ?? undefined,
                country: evt.country ?? undefined,
              }
            : undefined,
          occurredAt: toISODate(evt.dateIso),
          metadata: evt as Record<string, unknown>,
        })
      }
    }
  }

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'bring',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
