import type { Company } from '../../../schema/company'

export interface RawBiginAccount {
  id: string
  Account_Name?: string
  Phone?: string
  Website?: string
  Industry?: string
  Owner?: { id: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawBiginAccount): Company {
  return {
    id: String(raw.id),
    name: raw.Account_Name ?? '',
    phone: raw.Phone ?? undefined,
    domain: raw.Website ?? undefined,
    industry: raw.Industry ?? undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.Account_Name = data.name
  if (data.phone !== undefined) out.Phone = data.phone
  if (data.domain !== undefined) out.Website = data.domain
  if (data.industry !== undefined) out.Industry = data.industry
  return out
}
