import type { Company } from '../../../schema/company'

export interface RawDeskeraCompany {
  id: string | number
  name?: string
  email?: string
  phone?: string
  ownerId?: string | number
  [key: string]: unknown
}

export function transformCompany(raw: RawDeskeraCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: raw.phone,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
