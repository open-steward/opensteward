import type { Company } from '../../../schema/company'

export interface RawActiveCampaignCompany {
  id: string | number
  name: string
  phone?: string
  orgurl?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawActiveCampaignCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    phone: raw.phone ?? undefined,
    domain: raw.orgurl ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.orgurl = data.domain
  return out
}
