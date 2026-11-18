import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

// Korea Post does not expose a /carriers REST endpoint.
// The carrier is Korea Post itself — a single well-known entity.
// This transform builds a static Carrier record from the adapter's own identity.
// Derived: carrier entity is Korea Post; no remote listing endpoint is needed.

export interface KoreaPostServiceRaw {
  code?: string | null
  name?: string | null
  [key: string]: unknown
}

export interface KoreaPostCarrierRaw {
  id?: string | null
  name?: string | null
  code?: string | null
  tracking_url_template?: string | null
  services?: KoreaPostServiceRaw[] | null
  is_active?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformCarrier(raw: KoreaPostCarrierRaw): Carrier {
  const services: CarrierService[] | undefined = raw.services
    ? raw.services
        .filter((s): s is KoreaPostServiceRaw & { code: string } => typeof s.code === 'string' && s.code.length > 0)
        .map((s) => ({
          code: s.code,
          name: s.name ?? undefined,
        }))
    : undefined

  return {
    id: raw.id ?? raw.code ?? 'korea-post',
    name: raw.name ?? 'Korea Post',
    code: raw.code ?? 'korea-post',
    trackingUrlTemplate: raw.tracking_url_template ?? 'https://ems.epost.go.kr/front.Tracking01Eng.postal?POST_CODE={trackingNumber}',
    services: services,
    isActive: raw.is_active !== undefined && raw.is_active !== null ? Boolean(raw.is_active) : true,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Returns the static Korea Post carrier record (no API call required).
 * Used when the platform does not expose a carrier listing endpoint.
 */
export function buildStaticCarrier(): Carrier {
  return transformCarrier({
    id: 'korea-post',
    name: 'Korea Post',
    code: 'korea-post',
    tracking_url_template: 'https://ems.epost.go.kr/front.Tracking01Eng.postal?POST_CODE={trackingNumber}',
    is_active: true,
  })
}
