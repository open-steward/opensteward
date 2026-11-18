import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ShipsGoContainer, ShipsGoMilestone } from './shipment'

// ─── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps a ShipsGo milestone statusCode or status string to a canonical
 * TrackingEventStatus.
 *
 * ShipsGo milestone codes (documented):
 *   Booked, Loaded, Sailing, Arrived, Discharged, Not Released, Gate Out
 */
export function mapTrackingStatus(
  statusCode: string | null | undefined,
  status: string | null | undefined,
): TrackingEventStatus {
  const s = (statusCode ?? status ?? '').toLowerCase()
  if (!s) return 'UNKNOWN'
  if (s.includes('gate out') || s.includes('gateout')) return 'DELIVERED'
  if (s.includes('discharged')) return 'OUT_FOR_DELIVERY'
  if (s.includes('not released')) return 'OUT_FOR_DELIVERY'
  if (s.includes('arrived')) return 'IN_TRANSIT'
  if (s.includes('sailing') || s.includes('in transit')) return 'IN_TRANSIT'
  if (s.includes('loaded')) return 'IN_TRANSIT'
  if (s.includes('booked') || s.includes('created') || s.includes('registered')) return 'PRE_TRANSIT'
  if (s.includes('exception') || s.includes('fail')) return 'FAILURE'
  return 'UNKNOWN'
}

// ─── Transform ────────────────────────────────────────────────────────────────

/**
 * Converts a single ShipsGo milestone to a canonical TrackingEvent.
 */
function milestoneToEvent(
  raw: ShipsGoContainer,
  milestone: ShipsGoMilestone,
): TrackingEvent {
  const trackingNumber = raw.containerNumber ?? raw.mblNumber ?? undefined
  const carrierId = raw.scac ?? raw.shippingLine ?? 'shipsgo'

  // Prefer actualTime; fall back to estimatedTime for predicted events.
  const occurredAt = toISODate(milestone.actualTime ?? milestone.estimatedTime)

  const location =
    milestone.location != null
      ? { city: String(milestone.location) }
      : undefined

  return {
    trackingNumber,
    carrierId,
    status: mapTrackingStatus(milestone.statusCode, milestone.status),
    description: milestone.status ?? milestone.statusCode ?? undefined,
    location,
    occurredAt,
    metadata: milestone as Record<string, unknown>,
  }
}

/**
 * Converts a full ShipsGo container record into an array of canonical
 * TrackingEvents — one per milestone.  If no milestones are present,
 * returns a single synthetic event derived from the top-level status.
 */
export function transformTracking(raw: ShipsGoContainer): TrackingEvent[] {
  const milestones = raw.milestones ?? []

  if (milestones.length > 0) {
    return milestones.map((m) => milestoneToEvent(raw, m))
  }

  // Fallback: synthesise a single event from the container-level status.
  const trackingNumber = raw.containerNumber ?? raw.mblNumber ?? undefined
  const carrierId = raw.scac ?? raw.shippingLine ?? 'shipsgo'

  return [
    {
      trackingNumber,
      carrierId,
      status: mapTrackingStatus(raw.containerStatus, raw.containerStatus),
      description: raw.containerStatus ?? undefined,
      occurredAt: toISODate(raw.updatedDate ?? raw.ata ?? raw.eta),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
