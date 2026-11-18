import type { Company } from '../../../schema/company'

export interface RawFreshsalesCompany {
  id: number
  name: string
  website?: string
  phone?: string
  number_of_employees?: number
  owner_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawFreshsalesCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.website,
    phone: raw.phone,
    size: raw.number_of_employees,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
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
  if (data.size !== undefined) out.number_of_employees = data.size
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
