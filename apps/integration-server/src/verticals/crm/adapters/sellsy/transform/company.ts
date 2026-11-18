import type { Company } from '../../../schema/company'

export interface RawSellsyCompany {
  id: number | string
  name?: string
  email?: string
  phone_number?: string
  website?: string
  owner_id?: number | string | null
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSellsyCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone_number,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created,
    updated_at: raw.updated,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone_number = data.phone
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
