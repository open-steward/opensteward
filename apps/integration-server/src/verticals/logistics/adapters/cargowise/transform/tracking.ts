import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

// CargoWise returns milestones for a shipment (forwarding order)

export interface CargowiseMilestoneLocation {
  port?: string
  portName?: string
  country?: string
  city?: string
  [key: string]: unknown
}

export interface CargowiseMilestone {
  milestoneCode: string
  milestoneDescription?: string
  actualDate?: string
  estimatedDate?: string
  location?: CargowiseMilestoneLocation
  [key: string]: unknown
}

export interface CargowiseShipmentTrackingResponse {
  shipmentId: string
  houseBillNumber?: string
  masterBillNumber?: string
  currentStatus?: string
  currentStatusDescription?: string
  milestones?: CargowiseMilestone[]
  [key: string]: unknown
}

function mapMilestoneStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: CargowiseMilestoneLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.city || loc.portName || loc.country
  if (!hasAny) return undefined
  return {
    city: loc.city ?? loc.portName ?? undefined,
    country: loc.country ?? undefined,
  }
}

export function transformTrackingEvents(
  raw: CargowiseShipmentTrackingResponse,
): TrackingEvent[] {
  const trackingNumber = raw.houseBillNumber ?? raw.shipmentId

  const events: TrackingEvent[] = (raw.milestones ?? []).map((ms) => ({
    trackingNumber,
    carrierId: 'cargowise',
    status: mapMilestoneStatus(ms.milestoneCode),
    description: ms.milestoneDescription ?? ms.milestoneCode,
    location: toLocation(ms.location),
    occurredAt: toISODate(ms.actualDate ?? ms.estimatedDate),
    metadata: ms as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'cargowise',
      status: mapMilestoneStatus(raw.currentStatus),
      description: raw.currentStatusDescription ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
