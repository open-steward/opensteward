import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ─── Webshipper raw types ────────────────────────────────────────────────────

export interface WebshipperCarrierService {
  service_code?: string | null
  service_name?: string | null
  [key: string]: unknown
}

export interface WebshipperCarrierAttributes {
  alias?: string | null
  services?: WebshipperCarrierService[] | null
  test_mode?: boolean | null
  logo_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface WebshipperCarrier {
  id?: string | number | null
  type?: string
  attributes?: WebshipperCarrierAttributes | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformCarrier(raw: WebshipperCarrier): Carrier {
  const attrs = raw.attributes ?? {}

  const services: CarrierService[] = (attrs.services ?? [])
    .filter((s) => s.service_code)
    .map((s) => ({
      code: s.service_code as string,
      name: s.service_name ?? undefined,
    }))

  return {
    id: String(raw.id ?? ''),
    name: attrs.alias ?? undefined,
    code: String(raw.id ?? ''),
    services: services.length > 0 ? services : undefined,
    isActive: !(attrs.test_mode ?? false),
    createdAt: toISODate(attrs.created_at),
    updatedAt: toISODate(attrs.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
