import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { SeaVantageCargoResponse, SeaVantageMilestone } from './shipment'

// ─── Fleet vessel types ──────────────────────────────────────────────────────

export interface SeaVantageVesselPosition {
  timestamp?: string | null
  speed_over_ground?: number | null
  course_over_ground?: number | null
  true_heading?: number | null
  latitude?: number | null
  longitude?: number | null
  ais_destination?: string | null
  ais_eta?: string | null
  [key: string]: unknown
}

export interface SeaVantageVesselInfo {
  imo?: string | number | null
  mmsi?: string | number | null
  name?: string | null
  type?: string | null
  flag?: string | null
  position?: SeaVantageVesselPosition | null
  [key: string]: unknown
}

export interface SeaVantageFleetResponse {
  code?: number | null
  message?: string | null
  error?: boolean | null
  timestamp?: string | null
  response?: SeaVantageVesselInfo[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

export function mapMilestoneStatus(event: string | null | undefined): TrackingEventStatus {
  if (!event) return 'UNKNOWN'
  const e = event.toUpperCase()
  if (e.includes('GATE_IN') || e.includes('GATE-IN') || e.includes('EMPTY_RETURN')) return 'PRE_TRANSIT'
  if (e.includes('LOAD') || e.includes('DEPART') || e.includes('ON_VESSEL')) return 'IN_TRANSIT'
  if (e.includes('ARRIV') || e.includes('DISCHARG')) return 'IN_TRANSIT'
  if (e.includes('GATE_OUT') || e.includes('GATE-OUT')) return 'OUT_FOR_DELIVERY'
  if (e.includes('DELIVER')) return 'DELIVERED'
  if (e.includes('FAIL') || e.includes('EXCEPTION') || e.includes('ERROR')) return 'FAILURE'
  return 'UNKNOWN'
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Converts SeaVantage cargo milestones into canonical TrackingEvent records.
 * Falls back to a single synthetic event when no milestones are present.
 */
export function transformCargoTracking(raw: SeaVantageCargoResponse): TrackingEvent[] {
  const milestones: SeaVantageMilestone[] = raw.milestones ?? []
  const trackingNumber = raw.container_number ?? raw.mbl_number ?? raw.booking_number ?? undefined

  if (milestones.length === 0) {
    return [
      {
        trackingNumber,
        carrierId: raw.carrier ?? 'seavantage',
        status: 'UNKNOWN',
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return milestones.map((m) => ({
    trackingNumber,
    carrierId: raw.carrier ?? 'seavantage',
    status: mapMilestoneStatus(m.event),
    description: m.description ?? m.event ?? undefined,
    location: m.location
      ? { city: m.location }
      : undefined,
    occurredAt: toISODate(m.actual_time ?? m.estimated_time),
    metadata: m as Record<string, unknown>,
  }))
}

/**
 * Converts a SeaVantage vessel AIS position into a single TrackingEvent.
 */
export function transformVesselTracking(vessel: SeaVantageVesselInfo): TrackingEvent {
  const pos = vessel.position
  return {
    trackingNumber: vessel.imo != null ? String(vessel.imo) : undefined,
    carrierId: 'seavantage',
    status: 'IN_TRANSIT',
    description: vessel.name ?? undefined,
    location: pos?.ais_destination ? { city: pos.ais_destination } : undefined,
    occurredAt: toISODate(pos?.timestamp),
    metadata: vessel as Record<string, unknown>,
  }
}
