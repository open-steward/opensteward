import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface VehoPackage {
  package_id: string
  status?: string | null
  tracking_number?: string | null
  events?: Array<{ status?: string | null; description?: string | null; occurred_at?: string | null; location?: { city?: string | null; state?: string | null; postal_code?: string | null } | null }> | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'pending':         return 'PRE_TRANSIT'
    case 'in_transit':
    case 'received':
    case 'sorted':          return 'IN_TRANSIT'
    case 'out_for_delivery':return 'OUT_FOR_DELIVERY'
    case 'delivered':       return 'DELIVERED'
    case 'returned':        return 'RETURN_TO_SENDER'
    case 'failed':
    case 'undeliverable':   return 'FAILURE'
    default:                return 'UNKNOWN'
  }
}

export function transformTracking(raw: VehoPackage): TrackingEvent[] {
  const events = raw.events ?? []
  if (events.length === 0) {
    return [{
      shipmentId: raw.package_id,
      trackingNumber: raw.tracking_number ?? raw.package_id,
      carrierId: 'veho',
      status: mapStatus(raw.status),
      metadata: raw as Record<string, unknown>,
    }]
  }
  return events.map(e => ({
    shipmentId: raw.package_id,
    trackingNumber: raw.tracking_number ?? raw.package_id,
    carrierId: 'veho',
    status: mapStatus(e.status),
    description: e.description ?? undefined,
    location: e.location ? { city: e.location.city ?? undefined, state: e.location.state ?? undefined, postalCode: e.location.postal_code ?? undefined } : undefined,
    occurredAt: toISODate(e.occurred_at),
    metadata: e as unknown as Record<string, unknown>,
  }))
}
