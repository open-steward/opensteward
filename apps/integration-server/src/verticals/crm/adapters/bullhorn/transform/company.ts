import type { Company } from '../../../schema/company'

// Bullhorn "ClientCorporation" entity — client companies
export interface RawBullhornCompany {
  id: number
  name?: string
  phone?: string
  faxPhone?: string
  status?: string
  address?: { address1?: string }
  owner?: { id?: number }
  dateAdded?: number
  dateLastModified?: number
  [key: string]: unknown
}

export function transformCompany(raw: RawBullhornCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.dateAdded != null ? new Date(raw.dateAdded).toISOString() : undefined,
    updated_at: raw.dateLastModified != null ? new Date(raw.dateLastModified).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  return out
}
