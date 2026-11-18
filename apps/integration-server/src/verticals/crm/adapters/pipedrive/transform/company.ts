import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawPipedriveCompany {
  id: number
  name: string
  address?: string
  address_country?: string
  address_city?: string
  address_street?: string
  address_postal_code?: string
  owner_id?: { id: number; name?: string } | null
  add_time?: string
  update_time?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawPipedriveCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    owner_id: raw.owner_id?.id != null ? String(raw.owner_id.id) : undefined,
    address: raw.address
      ? {
          line1: raw.address_street,
          city: raw.address_city,
          postalCode: raw.address_postal_code,
          country: raw.address_country,
        }
      : undefined,
    created_at: raw.add_time,
    updated_at: raw.update_time,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.address) {
    if (data.address.line1) out.address = data.address.line1
    if (data.address.city) out.address_city = data.address.city
    if (data.address.postalCode) out.address_postal_code = data.address.postalCode
    if (data.address.country) out.address_country = data.address.country
  }
  return out
}

// ── API v2 ──────────────────────────────────────────────────────────────────

/**
 * v2's address object — `address` on an organization, `postal_address` on a
 * person (https://developers.pipedrive.com/docs/api/v2/openapi.yaml). v1
 * spread it across `address_*` fields.
 */
export interface RawPipedriveV2Address {
  /** "The full address of the organization" */
  value?: string | null
  /** "Country of the organization" — free text ("USA" in the documented example), not ISO 3166 */
  country?: string | null
  /** "Admin area level 1 (e.g. state) of the organization" */
  admin_area_level_1?: string | null
  /** "Locality (e.g. city) of the organization" */
  locality?: string | null
  /** "Postal code of the organization" */
  postal_code?: string | null
  [key: string]: unknown
}

/**
 * City, region and postal code from a v2 address. `country` is left out: the
 * canonical field is ISO 3166-1 alpha-2 and Pipedrive documents free text
 * (its own example is "USA"). No line is built from `route` and
 * `street_number`, whose order varies by country; the full `value` stays in
 * `metadata`.
 */
export function transformAddressV2(
  raw: RawPipedriveV2Address | null | undefined,
): Company['address'] {
  if (!raw) return undefined
  const address = {
    city: raw.locality ?? undefined,
    region: raw.admin_area_level_1 ?? undefined,
    postalCode: raw.postal_code ?? undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

/**
 * An organization as `GET /api/v2/organizations` and
 * `GET /api/v2/organizations/{id}` return it (getOrganizations /
 * getOrganization in the v2 spec). v2 returns `owner_id` as a plain integer
 * and timestamps in RFC 3339.
 */
export interface RawPipedriveV2Organization {
  /** "The ID of the organization" */
  id: number
  /** "The name of the organization" */
  name: string
  /** "The ID of the user who owns the organization" */
  owner_id?: number | null
  /** "The creation date and time of the organization" */
  add_time?: string
  /** "The last updated date and time of the organization" (nullable) */
  update_time?: string | null
  /** "The address of the organization" (nullable) */
  address?: RawPipedriveV2Address | null
  /** "The number of employees in the organization" (nullable integer) */
  employee_count?: number | null
  [key: string]: unknown
}

export function transformCompanyV2(raw: RawPipedriveV2Organization): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    size: raw.employee_count ?? undefined,
    address: transformAddressV2(raw.address),
    created_at: toIsoDatetime(raw.add_time),
    updated_at: toIsoDatetime(raw.update_time),
    metadata: raw,
  }
}
