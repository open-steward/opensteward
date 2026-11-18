import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

// ─── Shipwire raw types ────────────────────────────────────────────────────
// Source: GET /api/v3.1/carriers  (list) / GET /api/v3.1/carriers/:id (single)
// Docs:   https://www.shipwire.com/developers/carrier/

export interface ShipwireCarrierService {
  code: string | null
  name: string | null
  transit_time_min: number | null
  transit_time_max: number | null
  [key: string]: unknown
}

export interface ShipwireCarrier {
  id: number | string
  name: string | null
  code: string | null
  is_active: boolean | null
  tracking_url_template: string | null
  services: ShipwireCarrierService[] | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformCarrier(raw: ShipwireCarrier): Carrier {
  const services = (raw.services ?? [])
    .filter((s) => s.code != null)
    .map((s) => ({
      code: s.code as string,
      name: s.name ?? undefined,
      transitDaysMin: s.transit_time_min ?? undefined,
      transitDaysMax: s.transit_time_max ?? undefined,
    }))

  return {
    id: String(raw.id),
    name: raw.name ?? undefined,
    code: raw.code ?? undefined,
    isActive: raw.is_active ?? undefined,
    trackingUrlTemplate: raw.tracking_url_template ?? undefined,
    services: services.length > 0 ? services : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
