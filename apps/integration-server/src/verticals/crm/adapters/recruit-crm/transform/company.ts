import type { Company } from '../../../schema/company'

// Recruit CRM Company entity
// Docs: https://docs.recruitcrm.io/
export interface RawRecruitCrmCompany {
  id?: string | number
  slug?: string
  name?: string
  phone?: string
  website?: string
  owner?: { id?: string | number; slug?: string } | string | number
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawRecruitCrmCompany): Company {
  const ownerId = typeof raw.owner === 'object' && raw.owner !== null
    ? raw.owner.id ?? raw.owner.slug
    : raw.owner
  return {
    id: String(raw.id ?? raw.slug ?? ''),
    name: raw.name ?? '',
    phone: raw.phone,
    domain: raw.website,
    owner_id: ownerId != null ? String(ownerId) : undefined,
    created_at: raw.created_on,
    updated_at: raw.updated_on,
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
