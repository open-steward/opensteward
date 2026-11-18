import type { Company } from '../../../schema/company'

// SALESmanago doesn't have a dedicated Company resource —
// company info is stored as a property on contacts.
// We surface a minimal stub.
export interface RawSaleSmanagoCompany {
  id?: string
  name?: string
  phone?: string
  domain?: string
  industry?: string
  createdOn?: number
  modifiedOn?: number
  [key: string]: unknown
}

export function transformCompany(raw: RawSaleSmanagoCompany): Company {
  return {
    id: String(raw.id ?? ''),
    name: raw.name ?? '',
    phone: raw.phone,
    domain: raw.domain,
    industry: raw.industry,
    created_at: raw.createdOn != null ? new Date(raw.createdOn as number).toISOString() : undefined,
    updated_at: raw.modifiedOn != null ? new Date(raw.modifiedOn as number).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.domain = data.domain
  return out
}
