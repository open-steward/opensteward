import type { Company } from '../../../schema/company'

export interface RawVtigerCompany {
  id: string
  accountname: string
  website?: string
  phone?: string
  description?: string
  assigned_user_id?: string
  createdtime?: string
  modifiedtime?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawVtigerCompany): Company {
  return {
    id: String(raw.id),
    name: raw.accountname,
    domain: raw.website,
    phone: raw.phone,
    owner_id: raw.assigned_user_id ? String(raw.assigned_user_id) : undefined,
    created_at: raw.createdtime,
    updated_at: raw.modifiedtime,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.accountname = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  return out
}
