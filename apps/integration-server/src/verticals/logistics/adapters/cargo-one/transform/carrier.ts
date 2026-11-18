import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

/**
 * cargo.one exposes airline/carrier objects via GET /carriers.
 * These represent the air freight carriers available on the platform.
 */
export interface CargoOneCarrierService {
  code?: string | null
  name?: string | null
  transitDaysMin?: number | null
  transitDaysMax?: number | null
  [key: string]: unknown
}

export interface CargoOneCarrier {
  id?: string | null
  code?: string | null
  iata_code?: string | null
  name?: string | null
  tracking_url_template?: string | null
  services?: CargoOneCarrierService[] | null
  is_active?: boolean | null
  active?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: CargoOneCarrier): Carrier {
  const id = raw.id ?? raw.iata_code ?? raw.code ?? undefined
  const code = raw.iata_code ?? raw.code ?? undefined
  const services = (raw.services ?? []).map((s) => ({
    code: s.code ?? 'UNKNOWN',
    name: s.name ?? undefined,
    transitDaysMin: s.transitDaysMin ?? undefined,
    transitDaysMax: s.transitDaysMax ?? undefined,
  }))

  return {
    id: id ?? undefined,
    name: raw.name ?? undefined,
    code,
    trackingUrlTemplate: raw.tracking_url_template ?? undefined,
    services: services.length > 0 ? services : undefined,
    isActive: raw.is_active ?? raw.active ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
