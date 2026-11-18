import type { Company } from '../../../schema/company'

// SuiteCRM Account (maps to Company, JSON:API flattened)
export interface RawSuiteCrmAccount {
  id?: string
  name?: string
  phone_office?: string
  website?: string
  industry?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSuiteCrmAccount): Company {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    phone: raw.phone_office,
    domain: raw.website,
    industry: raw.industry,
    owner_id: raw.assigned_user_id != null ? String(raw.assigned_user_id) : undefined,
    created_at: raw.date_entered,
    updated_at: raw.date_modified,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone_office = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
