import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import { requiredText } from '../required'

/**
 * An account as GET /company/ ("list of accounts") and GET /company/{companyId}/
 * ("account detail") return it. Only fields the documented 200 examples carry.
 */
export interface RawRaynetAccount {
  id: number
  name?: string | null
  owner?: { id?: number; fullName?: string } | null
  /** "[Industry] Record ID from the EconomyActivity picklist" (PUT /company/). */
  economyActivity?: { id?: number; value?: string } | null
  primaryAddress?: {
    address?: {
      city?: string | null
      /** The ISO 3166-1 alpha-2 code, as the `primaryAddress-address.countryCode` filter names it. */
      countryCode?: string | null
      province?: string | null
      street?: string | null
      zipCode?: string | null
    } | null
    contactInfo?: {
      email?: string | null
      tel1?: string | null
      www?: string | null
    } | null
  } | null
  tags?: string[] | null
  'rowInfo.createdAt'?: string | null
  'rowInfo.updatedAt'?: string | null
  [key: string]: unknown
}

/** `www.test.rnt` (the documented example) or `https://acme.example/x` → host. */
function domainOf(www: string | null | undefined): string | undefined {
  if (!www) return undefined
  const host = www
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/)[0]
  return host || undefined
}

export function transformCompany(raw: RawRaynetAccount): Company {
  const addr = raw.primaryAddress?.address
  const info = raw.primaryAddress?.contactInfo
  return {
    id: String(raw.id),
    name: requiredText(raw.name, `account ${raw.id}`),
    domain: domainOf(info?.www),
    phone: info?.tel1 || undefined,
    industry: raw.economyActivity?.value || undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    address: addr
      ? {
          line1: addr.street ?? undefined,
          city: addr.city ?? undefined,
          region: addr.province ?? undefined,
          postalCode: addr.zipCode ?? undefined,
          country: addr.countryCode ?? undefined,
        }
      : undefined,
    tags: raw.tags ?? undefined,
    created_at: toIsoDatetime(raw['rowInfo.createdAt']),
    updated_at: toIsoDatetime(raw['rowInfo.updatedAt']),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  return out
}
