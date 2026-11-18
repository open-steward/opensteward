import type { Company } from '../../../schema/company'

export interface RawPipelinerAccount {
  id: string
  name: string
  homepage?: string
  phone1?: string
  owner_id?: string | null
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawPipelinerAccount): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: raw.homepage,
    phone: raw.phone1,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created,
    updated_at: raw.modified,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.homepage = data.domain
  if (data.phone !== undefined) out.phone1 = data.phone
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
