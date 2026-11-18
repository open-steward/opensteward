import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawPipelineCrmCompany {
  id: string | number
  name?: string
  website?: string
  phone?: string
  industry?: string
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawPipelineCrmCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    domain: raw.website,
    phone: raw.phone,
    industry: raw.industry,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  return out
}
