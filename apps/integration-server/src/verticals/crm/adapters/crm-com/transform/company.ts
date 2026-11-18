import type { Company } from '../../../schema/company'

// CRM.COM uses "organisations" for company-level entities
export interface RawCrmComOrganisation {
  id: string
  name?: string
  phone?: string
  domain?: string
  industry?: string
  owner_id?: string
  created_date?: string
  updated_date?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawCrmComOrganisation): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone,
    domain: raw.domain,
    industry: raw.industry,
    owner_id: raw.owner_id ? String(raw.owner_id) : undefined,
    created_at: raw.created_date,
    updated_at: raw.updated_date,
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
