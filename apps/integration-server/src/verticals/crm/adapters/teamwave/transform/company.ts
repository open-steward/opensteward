import type { Company } from '../../../schema/company'

export interface RawTeamwaveOrganization {
  id: number
  name: string
  website?: string
  phone?: string
  industry?: string
  owner_id?: number | null
  tags?: string[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawTeamwaveOrganization): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.website,
    phone: raw.phone,
    industry: raw.industry,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    tags: raw.tags,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
