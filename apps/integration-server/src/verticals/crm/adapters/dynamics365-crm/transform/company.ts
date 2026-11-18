import type { Company } from '../../../schema/company'

export interface RawDynamicsAccount {
  accountid: string
  name: string
  websiteurl?: string | null
  telephone1?: string | null
  description?: string | null
  _ownerid_value?: string | null
  createdon?: string | null
  modifiedon?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawDynamicsAccount): Company {
  return {
    id: String(raw.accountid),
    name: raw.name,
    domain: raw.websiteurl ?? undefined,
    phone: raw.telephone1 ?? undefined,
    owner_id: raw._ownerid_value ?? undefined,
    created_at: raw.createdon ?? undefined,
    updated_at: raw.modifiedon ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.websiteurl = data.domain
  if (data.phone !== undefined) out.telephone1 = data.phone
  return out
}
