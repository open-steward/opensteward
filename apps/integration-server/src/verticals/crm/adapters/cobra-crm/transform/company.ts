import type { Company } from '../../../schema/company'

// TODO: verify field names against Cobra CRM API docs (German/Dutch language)
export interface RawCobraCrmCompany {
  id: string | number
  name?: string
  phone?: string
  domain?: string
  industry?: string
  ownerId?: string | number | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawCobraCrmCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone ?? undefined,
    domain: raw.domain ?? undefined,
    industry: raw.industry ?? undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: raw.createdAt ?? undefined,
    updated_at: raw.updatedAt ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.domain = data.domain
  if (data.industry !== undefined) out.industry = data.industry
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
