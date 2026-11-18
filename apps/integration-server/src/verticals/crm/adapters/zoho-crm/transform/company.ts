import type { Company } from '../../../schema/company'

export interface RawZohoAccount {
  id: string
  Account_Name?: string
  Website?: string
  Phone?: string
  Description?: string
  Employees?: number | string | null
  Owner?: { id: string; name?: string } | null
  Created_Time?: string
  Modified_Time?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawZohoAccount): Company {
  const employees = raw.Employees != null ? parseInt(String(raw.Employees), 10) : undefined

  return {
    id: String(raw.id),
    name: raw.Account_Name ?? '',
    domain: raw.Website ?? undefined,
    phone: raw.Phone ?? undefined,
    size: employees != null && !isNaN(employees) ? employees : undefined,
    owner_id: raw.Owner?.id != null ? String(raw.Owner.id) : undefined,
    created_at: raw.Created_Time,
    updated_at: raw.Modified_Time,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  if (data.name !== undefined) record.Account_Name = data.name
  if (data.domain !== undefined) record.Website = data.domain
  if (data.phone !== undefined) record.Phone = data.phone
  if (data.size !== undefined) record.Employees = data.size
  return record
}
