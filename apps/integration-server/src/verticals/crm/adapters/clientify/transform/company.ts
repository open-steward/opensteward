import type { Company } from '../../../schema/company'

export interface RawClientifyCompany {
  id: string | number
  name?: string
  phone?: string
  website?: string
  industry?: string
  owner?: string | number | null
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawClientifyCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone ?? undefined,
    domain: raw.website ?? undefined,
    industry: raw.industry ?? undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: raw.date_added ?? undefined,
    updated_at: raw.date_modified ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
