import type { Company } from '../../../schema/company'

export interface RawSalesforceAccount {
  Id: string
  Name: string
  Website?: string | null
  Phone?: string | null
  Description?: string | null
  OwnerId?: string | null
  CreatedDate?: string
  LastModifiedDate?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawSalesforceAccount): Company {
  return {
    id: String(raw.Id),
    name: raw.Name,
    domain: raw.Website ?? undefined,
    phone: raw.Phone ?? undefined,
    owner_id: raw.OwnerId ?? undefined,
    created_at: raw.CreatedDate ?? undefined,
    updated_at: raw.LastModifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Name = data.name
  if (data.domain !== undefined) out.Website = data.domain
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.owner_id !== undefined) out.OwnerId = data.owner_id
  return out
}
