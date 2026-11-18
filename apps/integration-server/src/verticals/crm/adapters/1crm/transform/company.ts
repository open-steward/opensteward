/**
 * Transform 1CRM Account records to/from the canonical Company schema.
 *
 * 1CRM module: Account
 * Key API fields: id, name, phone_office, website, industry, employees,
 *   billing_address_street, billing_address_city, billing_address_state,
 *   billing_address_postalcode, billing_address_country,
 *   assigned_user_id, date_entered, date_modified
 */

import type { Company } from '../../../schema/company'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime, isIso3166Alpha2 } from '@opensteward/shared'

export interface Raw1CrmAccount {
  id: string
  name?: string
  phone_office?: string
  website?: string
  industry?: string
  employees?: number | string
  billing_address_street?: string
  billing_address_city?: string
  billing_address_state?: string
  billing_address_postalcode?: string
  billing_address_country?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

/**
 * ISO 3166-1 alpha-2 guard — 1CRM may store full country names. Validates by
 * membership (`isIso3166Alpha2`), not shape: a bare `/^[A-Z]{2}$/` check
 * would let well-formed non-codes ('XK', 'ZZ', 'XX') through unchanged.
 */
function toIso3166Alpha2(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  return isIso3166Alpha2(raw) ? raw : undefined
}

/** Build a canonical Address from 1CRM billing_address_* fields. */
function buildAddress(raw: Raw1CrmAccount): Address | undefined {
  const line1 = raw.billing_address_street ?? undefined
  const city = raw.billing_address_city ?? undefined
  const region = raw.billing_address_state ?? undefined
  const postalCode = raw.billing_address_postalcode ?? undefined
  const country = toIso3166Alpha2(raw.billing_address_country)

  if (!line1 && !city && !region && !postalCode && !country) return undefined

  return { line1, city, region, postalCode, country }
}

export function transformCompany(raw: Raw1CrmAccount): Company {
  const employeesRaw = raw.employees
  const size = employeesRaw != null
    ? parseInt(String(employeesRaw), 10)
    : undefined

  // Strip protocol from website to get a plain domain
  let domain: string | undefined
  if (raw.website) {
    try {
      domain = new URL(raw.website).hostname.replace(/^www\./, '') || raw.website
    } catch {
      domain = raw.website
    }
  }

  return {
    id: String(raw.id),
    name: raw.name ?? '',
    domain,
    phone: raw.phone_office ?? undefined,
    industry: raw.industry ?? undefined,
    size: size != null && !isNaN(size) ? size : undefined,
    owner_id: raw.assigned_user_id ?? undefined,
    address: buildAddress(raw),
    created_at: toIsoDatetime(raw.date_entered),
    updated_at: toIsoDatetime(raw.date_modified),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone_office = data.phone
  if (data.domain !== undefined) out.website = `https://${data.domain}`
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.employees = data.size
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  if (data.address !== undefined) {
    if (data.address.line1 !== undefined) out.billing_address_street = data.address.line1
    if (data.address.city !== undefined) out.billing_address_city = data.address.city
    if (data.address.region !== undefined) out.billing_address_state = data.address.region
    if (data.address.postalCode !== undefined) out.billing_address_postalcode = data.address.postalCode
    if (data.address.country !== undefined) out.billing_address_country = data.address.country
  }
  return out
}
