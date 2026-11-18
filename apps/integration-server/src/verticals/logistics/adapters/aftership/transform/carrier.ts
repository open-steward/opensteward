import type { Carrier } from '../../../schema/carrier'

export interface AfterShipCourier {
  slug: string
  name: string
  phone: string | null
  other_name: string | null
  web_url: string | null
  required_fields: string[]
  optional_fields: string[]
  default_language: string | null
  support_languages: string[] | null
  service_from_country_iso3: string[] | null
  [key: string]: unknown
}

export function transformCarrier(raw: AfterShipCourier): Carrier {
  return {
    id: raw.slug,
    name: raw.name,
    code: raw.slug,
    isActive: true,
    metadata: raw as Record<string, unknown>,
  }
}
