import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * Raw Manatal organization object from GET /organizations/ or GET /organizations/{id}/.
 * Manatal "organizations" map to canonical CRM companies.
 */
export interface RawManatalOrganization {
  id: number
  name?: string
  description?: string
  website?: string
  phone?: string
  industry?: string | null
  size?: number | null
  owner?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawManatalOrganization): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    domain: raw.website ?? undefined,
    phone: raw.phone ?? undefined,
    industry: raw.industry ?? undefined,
    size: raw.size ?? undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.size = data.size
  if (data.owner_id !== undefined) out.owner = data.owner_id ? Number(data.owner_id) : null
  return out
}
