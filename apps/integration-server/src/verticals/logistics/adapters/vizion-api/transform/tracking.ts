import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { VizionMilestone, VizionUpdateEvent } from './shipment'

// ─── Status mapping ──────────────────────────────────────────────────────────

export function mapMilestoneStatus(
  description: string | null | undefined,
  planned: boolean | null | undefined,
): TrackingEventStatus {
  const d = (description ?? '').toUpperCase()

  if (d.includes('DELIVERED') || d.includes('FINAL DELIVERY')) return 'DELIVERED'
  if (d.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (d.includes('GATE-IN') || d.includes('GATE IN') || d.includes('PICKUP')) return 'OUT_FOR_DELIVERY'
  if (
    d.includes('LOADED') ||
    d.includes('DEPARTED') ||
    d.includes('DISCHARG') ||
    d.includes('ARRIVED') ||
    d.includes('TRANSIT') ||
    d.includes('VESSEL') ||
    d.includes('RAIL') ||
    d.includes('PORT')
  )
    return planned ? 'IN_TRANSIT' : 'IN_TRANSIT'
  if (d.includes('EMPTY') || d.includes('GATE-OUT') || d.includes('STUFFED') || d.includes('SEALED'))
    return 'PRE_TRANSIT'
  if (d.includes('RETURN') || d.includes('REDELIVERY')) return 'RETURN_TO_SENDER'
  if (d.includes('EXCEPTION') || d.includes('FAIL') || d.includes('DELAY')) return 'FAILURE'

  return 'UNKNOWN'
}

// ─── Transform a single milestone into a TrackingEvent ───────────────────────

export function transformMilestone(
  milestone: VizionMilestone,
  containerId: string | null | undefined,
  referenceId: string | null | undefined,
  carrierId: string | null | undefined,
): TrackingEvent {
  const loc = milestone.location
  return {
    shipmentId: referenceId ?? undefined,
    trackingNumber: containerId ?? undefined,
    carrierId: carrierId ?? 'vizion-api',
    status: mapMilestoneStatus(milestone.description, milestone.planned),
    description: milestone.description ?? milestone.raw_description ?? undefined,
    location: loc
      ? {
          city: loc.city ?? loc.name ?? undefined,
          state: loc.state ?? undefined,
          country: loc.country ?? undefined,
          postalCode: loc.unlocode ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(milestone.timestamp),
    metadata: milestone as Record<string, unknown>,
  }
}

// ─── Transform a full update event into TrackingEvents ───────────────────────

export function transformUpdateToTrackingEvents(event: VizionUpdateEvent): TrackingEvent[] {
  const payload = event.payload ?? {}
  const milestones = payload.milestones ?? []
  const containerId = payload.container_id
  const referenceId = event.reference_id ?? event.id
  const carrierId = payload.carrier_scac ?? 'vizion-api'

  if (milestones.length === 0) {
    return [
      {
        shipmentId: referenceId ?? undefined,
        trackingNumber: containerId ?? undefined,
        carrierId,
        status: 'UNKNOWN',
        metadata: event as Record<string, unknown>,
      },
    ]
  }

  return milestones.map((m) => transformMilestone(m, containerId, referenceId, carrierId))
}
