import type { Company } from '../../../schema/company'

export interface RawAgendorCompany {
  id: number | string
  name?: string
  email?: string
  phone?: string
  website?: string
  owner?: { id: number | string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawAgendorCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone,
    domain: raw.website,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.website = data.domain
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
