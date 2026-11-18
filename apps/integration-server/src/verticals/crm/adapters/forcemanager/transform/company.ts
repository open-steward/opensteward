import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import { refId, requireId, text, type ValueRef } from '../refs'

/**
 * ForceManager Account, as documented by GET /accounts and GET /accounts/{ID}
 * (https://developer.forcemanager.com/openapi.json, "List of the supported
 * Accounts attributes"). Only the attributes this transform reads are typed.
 */
export interface RawForceManagerAccount {
  id?: number | string | null
  name?: string | null
  phone?: string | null
  website?: string | null
  salesRepId1?: ValueRef | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  region?: string | null
  postcode?: string | null
  dateCreated?: string | null
  dateUpdated?: string | null
  [key: string]: unknown
}

/** `website` is "The Account's website address" (e.g. "https://www.h-farm.com"); the canonical field is a domain. */
function hostOf(website: string | undefined): string | undefined {
  if (!website) return undefined
  try {
    return new URL(website.includes('://') ? website : `https://${website}`).hostname || undefined
  } catch {
    return undefined
  }
}

export function transformCompany(raw: RawForceManagerAccount): Company {
  const line1 = text(raw.address1)
  const line2 = text(raw.address2)
  const city = text(raw.city)
  const region = text(raw.region)
  const postalCode = text(raw.postcode)
  return {
    id: requireId(raw, 'account'),
    name: raw.name ?? '',
    phone: text(raw.phone),
    domain: hostOf(text(raw.website)),
    // "salesRepId1 | Object, Null | First User responsible for the Account"
    owner_id: refId(raw.salesRepId1),
    // countryId.value is a localised country name ("España"), not ISO 3166-1, so no country.
    address:
      line1 || line2 || city || region || postalCode
        ? { line1, line2, city, region, postalCode }
        : undefined,
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateUpdated),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.web = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
