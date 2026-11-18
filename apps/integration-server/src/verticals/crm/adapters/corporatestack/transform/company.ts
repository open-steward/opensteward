import type { Company } from '../../../schema/company'

// CorporateStack company entity
// TODO: verify exact field names from API response
export interface RawCorporateStackCompany {
  id: string | number
  name?: string
  phone?: string
  domain?: string
  industry?: string
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawCorporateStackCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone,
    domain: raw.domain,
    industry: raw.industry,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.domain = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
