import type { Company } from '../../../schema/company'

export interface RawZendeskSellCompany {
  id: number
  name: string
  is_organization: boolean
  website?: string
  phone?: string
  description?: string
  owner_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawZendeskSellCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.website,
    phone: raw.phone,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = { is_organization: true }
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
