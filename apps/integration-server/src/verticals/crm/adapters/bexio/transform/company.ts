import type { Company } from '../../../schema/company'

// Bexio uses a unified contact model; contact_type_id=1 is a company
export interface RawBexioCompany {
  id?: number
  name_1?: string   // company name
  mail?: string
  phone_fixed?: string
  url?: string
  owner_id?: number
  contact_type_id?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawBexioCompany): Company {
  return {
    id: String(raw.id ?? ''),
    name: raw.name_1 ?? '',
    phone: raw.phone_fixed,
    domain: raw.url,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = { contact_type_id: 1 }
  if (data.name !== undefined) out.name_1 = data.name
  if (data.phone !== undefined) out.phone_fixed = data.phone
  if (data.domain !== undefined) out.url = data.domain
  return out
}
