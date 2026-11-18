import type { Company } from '../../../schema/company'

export interface RawCreatioAccount {
  Id: string
  Name: string
  Web?: string
  Phone?: string
  OwnerId?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawCreatioAccount): Company {
  return {
    id: String(raw.Id),
    name: raw.Name,
    domain: raw.Web,
    phone: raw.Phone,
    owner_id: raw.OwnerId ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Name = data.name
  if (data.domain !== undefined) out.Web = data.domain
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
