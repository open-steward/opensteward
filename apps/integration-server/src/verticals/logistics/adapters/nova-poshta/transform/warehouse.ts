import type { Warehouse } from '../../../schema/warehouse'
import { toISODate } from '../../shared/transform'

/**
 * Nova Poshta division/warehouse (branch) object returned by GET /divisions.
 */
export interface NovaPoshtaDivision {
  id?: string | null
  number?: string | null
  name?: string | null
  shortName?: string | null
  typeCode?: string | null
  city?: string | null
  settlement?: string | null
  region?: string | null
  street?: string | null
  streetNumber?: string | null
  flat?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  email?: string | null
  isActive?: boolean | null
  timezone?: string | null
  scheduleDescription?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function transformWarehouse(raw: NovaPoshtaDivision): Warehouse {
  const street1 = raw.street
    ? [raw.street, raw.streetNumber].filter(Boolean).join(' ') || undefined
    : undefined

  return {
    id: raw.id ?? undefined,
    name: raw.name ?? raw.shortName ?? undefined,
    code: raw.number ?? undefined,
    address: {
      street1,
      street2: raw.flat ? `Apt ${raw.flat}` : undefined,
      city: raw.city ?? raw.settlement ?? undefined,
      state: raw.region ?? undefined,
      postalCode: raw.postalCode ?? undefined,
      country: raw.countryCode ?? undefined,
      phone: raw.phone ?? undefined,
      email: raw.email ?? undefined,
    },
    isActive: raw.isActive ?? undefined,
    timezone: raw.timezone ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
