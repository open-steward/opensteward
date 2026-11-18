import type { Company } from '../../../schema/company'

export interface RawSugarAccount {
  id: string
  name: string
  website?: string
  phone_office?: string
  description?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value
  return `${value}Z`
}

export function transformCompany(raw: RawSugarAccount): Company {
  return {
    id: raw.id,
    name: raw.name,
    domain: raw.website || undefined,
    phone: raw.phone_office || undefined,
    owner_id: raw.assigned_user_id || undefined,
    created_at: toIso(raw.date_entered),
    updated_at: toIso(raw.date_modified),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone_office = data.phone
  return out
}
