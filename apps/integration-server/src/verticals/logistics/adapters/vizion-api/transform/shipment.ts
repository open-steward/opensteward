import type { Shipment, ShipmentStatus, OceanFields } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Vizion API raw types ────────────────────────────────────────────────────

export interface VizionLocation {
  name?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  facility?: string | null
  unlocode?: string | null
  geolocation?: { latitude?: number | null; longitude?: number | null } | null
}

export interface VizionMilestone {
  timestamp?: string | null
  location?: VizionLocation | null
  description?: string | null
  raw_description?: string | null
  vessel?: string | null
  vessel_imo?: string | null
  vessel_mmsi?: string | null
  voyage?: string | null
  planned?: boolean | null
  mode?: string | null
  source?: string | null
  [key: string]: unknown
}

export interface VizionPayload {
  bill_of_lading?: string | null
  carrier_scac?: string | null
  container_id?: string | null
  container_iso?: string | null
  reference_id?: string | null
  milestones?: VizionMilestone[] | null
  origin_port?: VizionLocation | null
  destination_port?: VizionLocation | null
  inland_origin?: VizionLocation | null
  inland_destination?: VizionLocation | null
  [key: string]: unknown
}

export interface VizionReference {
  id?: string | null
  container_id?: string | null
  carrier_scac?: string | null
  carrier_code?: string | null
  active?: boolean | null
  last_update_status?: string | null
  callback_url?: string | null
  shipment_completed?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface VizionUpdateEvent {
  id?: string | null
  status?: string | null
  reference_id?: string | null
  organization_id?: string | null
  parent_reference_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  payload?: VizionPayload | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapShipmentStatus(
  status: string | null | undefined,
  milestones: VizionMilestone[] | null | undefined,
): ShipmentStatus {
  // Derive from last non-planned milestone description if available
  const actual = (milestones ?? []).filter((m) => m.planned !== true)
  const lastDesc = actual.length > 0 ? actual[actual.length - 1]?.description ?? '' : ''
  const desc = lastDesc.toUpperCase()

  if (desc.includes('DELIVERED') || desc.includes('FINAL DELIVERY')) return 'DELIVERED'
  if (desc.includes('OUT FOR DELIVERY') || desc.includes('GATE-IN')) return 'OUT_FOR_DELIVERY'
  if (
    desc.includes('LOADED') ||
    desc.includes('DEPARTED') ||
    desc.includes('DISCHARG') ||
    desc.includes('ARRIVED') ||
    desc.includes('TRANSIT') ||
    desc.includes('VESSEL')
  )
    return 'IN_TRANSIT'
  if (desc.includes('EMPTY') || desc.includes('GATE-OUT')) return 'LABEL_CREATED'

  // Fall back to top-level status
  const s = (status ?? '').toUpperCase()
  if (s === 'DATA_RECEIVED' || s === 'IN_TRANSIT') return 'IN_TRANSIT'
  if (!status && (milestones ?? []).length === 0) return 'PENDING'
  if ((milestones ?? []).length > 0) return 'IN_TRANSIT'
  return 'UNKNOWN'
}

// ─── Port helpers ────────────────────────────────────────────────────────────

function portCode(loc: VizionLocation | null | undefined): string | undefined {
  if (!loc) return undefined
  return loc.unlocode ?? loc.name ?? undefined
}

// ─── Main transform ──────────────────────────────────────────────────────────

export function transformReferenceToShipment(raw: VizionReference): Shipment {
  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.last_update_status, undefined),
    trackingNumber: raw.container_id ?? undefined,
    carrierId: raw.carrier_scac ?? raw.carrier_code ?? 'vizion-api',
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    mode: 'ocean',
    ocean: {
      containerNumber: raw.container_id ?? undefined,
    } satisfies OceanFields,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformUpdateToShipment(event: VizionUpdateEvent): Shipment {
  const payload = event.payload ?? {}
  const milestones = payload.milestones ?? []

  // Find ETD / ETA from planned milestones
  const plannedDeparture = milestones.find(
    (m) =>
      m.planned === true &&
      ((m.description ?? '').toUpperCase().includes('DEPARTED') ||
        (m.description ?? '').toUpperCase().includes('DEPART')),
  )
  const plannedArrival = milestones.find(
    (m) =>
      m.planned === true &&
      ((m.description ?? '').toUpperCase().includes('ARRIV') ||
        (m.description ?? '').toUpperCase().includes('ETA') ||
        (m.description ?? '').toUpperCase().includes('DISCHARG')),
  )

  // Find actual departure/arrival from non-planned milestones
  const actualDeparture = milestones.find(
    (m) =>
      m.planned !== true &&
      ((m.description ?? '').toUpperCase().includes('DEPARTED') ||
        (m.description ?? '').toUpperCase().includes('LOADED ONBOARD')),
  )
  const actualArrival = milestones.find(
    (m) =>
      m.planned !== true &&
      ((m.description ?? '').toUpperCase().includes('ARRIVED') ||
        (m.description ?? '').toUpperCase().includes('DISCHARGED')),
  )

  const vessel = milestones.find((m) => m.vessel)
  const voyage = milestones.find((m) => m.voyage)

  const ocean: OceanFields = {
    containerNumber: payload.container_id ?? undefined,
    containerType: payload.container_iso ?? undefined,
    billOfLadingNumber: payload.bill_of_lading ?? undefined,
    vesselName: vessel?.vessel ?? undefined,
    voyageNumber: voyage?.voyage ?? undefined,
    shippingLine: payload.carrier_scac ?? undefined,
    portOfLoading: portCode(payload.origin_port),
    portOfDischarge: portCode(payload.destination_port),
    estimatedDeparture: toISODate(plannedDeparture?.timestamp),
    estimatedArrival: toISODate(plannedArrival?.timestamp),
    actualDeparture: toISODate(actualDeparture?.timestamp),
    actualArrival: toISODate(actualArrival?.timestamp),
  }

  return {
    id: event.reference_id ?? event.id ?? undefined,
    status: mapShipmentStatus(event.status, milestones),
    trackingNumber: payload.container_id ?? undefined,
    carrierId: payload.carrier_scac ?? 'vizion-api',
    reference: payload.bill_of_lading ?? undefined,
    createdAt: toISODate(event.created_at),
    updatedAt: toISODate(event.updated_at),
    mode: 'ocean',
    ocean,
    metadata: event as Record<string, unknown>,
  }
}
