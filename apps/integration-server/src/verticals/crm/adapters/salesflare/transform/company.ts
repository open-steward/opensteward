import type { Company } from '../../../schema/company'

export interface RawSalesflareCompany {
  id: number
  name: string
  website?: string
  phone_number?: string
  description?: string
  size?: number
  owner?: { id: number; name?: string } | null
  tags?: string[]
  creation_time?: string
  modification_time?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSalesflareCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.website,
    phone: raw.phone_number,
    size: raw.size,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    tags: raw.tags,
    created_at: raw.creation_time,
    updated_at: raw.modification_time,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone_number = data.phone
  if (data.size !== undefined) out.size = data.size
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
