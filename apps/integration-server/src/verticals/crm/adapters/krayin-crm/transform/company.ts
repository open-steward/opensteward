import { isIso3166Alpha2, toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import { optionalString, requireId, requireString } from '../fields'

/**
 * The documented `Organization` schema's address items
 * (src/Docs/Models/Contact/Organization.php): address "Street address",
 * city "City name", state "State name", country "Country code" (example
 * "US"), postcode "Postal code".
 */
export interface RawKrayinAddress {
  address?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postcode?: string | null
}

/**
 * GET /api/v1/contacts/organizations and /api/v1/contacts/organizations/{id}.
 * Fields from krayin/rest-api src/Http/Resources/V1/Contact/OrganizationResource.php:
 * id, name, address, created_at, updated_at.
 */
export interface RawKrayinOrganization {
  id?: number | string
  name?: string
  address?: RawKrayinAddress | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function transformAddress(a: RawKrayinAddress): Company['address'] {
  const country = optionalString(a.country)
  return {
    line1: optionalString(a.address),
    city: optionalString(a.city),
    region: optionalString(a.state),
    postalCode: optionalString(a.postcode),
    country: country !== undefined && isIso3166Alpha2(country) ? country : undefined,
  }
}

export function transformCompany(raw: RawKrayinOrganization): Company {
  return {
    id: requireId(raw.id, 'organization'),
    name: requireString(raw.name, 'organization name'),
    address:
      raw.address && typeof raw.address === 'object' && !Array.isArray(raw.address)
        ? transformAddress(raw.address)
        : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  if (data.domain !== undefined) out['website'] = data.domain
  if (data.phone !== undefined) out['contact_numbers'] = [{ value: data.phone, label: 'work' }]
  if (data.address) {
    out['address'] = {
      city: data.address.city,
      state: data.address.region,
      country: data.address.country,
      postcode: data.address.postalCode,
    }
  }
  return out
}
