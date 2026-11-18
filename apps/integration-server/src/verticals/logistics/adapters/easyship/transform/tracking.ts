import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

// ─── Easyship raw types ─────────────────────────────────────────────────────
//
// GET shipments/trackings?easyship_shipment_id={id}&include_checkpoints=true
// (scope public.track:read). Checkpoints live on the
// matching shipment, not as a flat events array; `country_iso3` is
// alpha-3, so it needs normalising before it can satisfy the canonical
// schema's alpha-2 `AddressSchema.country`.

export interface EasyshipCheckpoint {
  checkpoint_time?: string | null
  message?: string | null
  primary_status?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country_iso3?: string | null
  [key: string]: unknown
}

export interface EasyshipTrackingShipment {
  easyship_shipment_id?: string | null
  checkpoints?: EasyshipCheckpoint[] | null
  [key: string]: unknown
}

export interface EasyshipTrackingResponse {
  shipments?: EasyshipTrackingShipment[] | null
  meta?: unknown
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapCheckpointStatus(primaryStatus: string | null | undefined): TrackingEventStatus {
  const v = (primaryStatus ?? '').toUpperCase()
  if (!v) return 'UNKNOWN'
  if (v.includes('PRE') || v === 'CONFIRMED' || v === 'PENDING' || v === 'INFORMED' || v === 'LABEL_CREATED' || v === 'MANIFESTED') return 'PRE_TRANSIT'
  if (v.includes('OUT_FOR_DELIVERY') || v.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (v === 'DELIVERED' || v.includes('DELIVERED')) return 'DELIVERED'
  if (v === 'AVAILABLE_FOR_PICKUP' || v.includes('PICKUP') || v.includes('PICK UP')) return 'AVAILABLE_FOR_PICKUP'
  if (v.includes('RETURN')) return 'RETURN_TO_SENDER'
  if (v.includes('FAIL') || v.includes('EXCEPTION') || v.includes('REFUSED') || v.includes('STOPPED')) return 'FAILURE'
  if (v.includes('TRANSIT') || v.includes('EN_ROUTE') || v.includes('PICKED_UP')) return 'IN_TRANSIT'
  return 'UNKNOWN'
}

function toCheckpointLocation(cp: EasyshipCheckpoint): Address | undefined {
  const hasAny = cp.city || cp.state || cp.postal_code || cp.country_iso3
  if (!hasAny) return undefined
  return {
    city: cp.city ?? undefined,
    state: cp.state ?? undefined,
    postalCode: cp.postal_code ?? undefined,
    country: toIso3166Alpha2(cp.country_iso3),
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: EasyshipTrackingResponse): TrackingEvent[] {
  const shipment = raw.shipments?.[0]
  if (!shipment) return []

  const shipmentId = shipment.easyship_shipment_id ?? undefined
  const checkpoints = shipment.checkpoints ?? []

  return checkpoints.map((cp) => ({
    shipmentId,
    carrierId: 'easyship',
    status: mapCheckpointStatus(cp.primary_status),
    description: cp.message ?? undefined,
    location: toCheckpointLocation(cp),
    occurredAt: toISODate(cp.checkpoint_time),
    metadata: cp as Record<string, unknown>,
  }))
}
