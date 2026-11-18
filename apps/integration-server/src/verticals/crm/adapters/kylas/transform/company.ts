import type { Company } from '../../../schema/company'

// Kylas CRM company entity (called "companies" in API)
export interface RawKylasCompany {
  id: number
  name?: string
  phoneNumber?: string
  website?: string
  industry?: string
  ownedBy?: { id?: number }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawKylasCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phoneNumber,
    domain: raw.website,
    industry: raw.industry,
    owner_id: raw.ownedBy?.id != null ? String(raw.ownedBy.id) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phoneNumber = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
