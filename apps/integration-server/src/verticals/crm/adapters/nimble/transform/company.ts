import type { Company } from '../../../schema/company'

interface NimbleFieldValue {
  value?: string
}

export interface RawNimbleCompany {
  id: string
  type?: string
  fields?: Record<string, NimbleFieldValue[]>
  owner_id?: string | number | null
  created?: string
  updated?: string
  [key: string]: unknown
}

function fieldValue(
  fields: Record<string, NimbleFieldValue[]> | undefined,
  key: string,
): string | undefined {
  const arr = fields?.[key]
  if (!arr || arr.length === 0) return undefined
  return arr[0]?.value ?? undefined
}

export function transformCompany(raw: RawNimbleCompany): Company {
  return {
    id: String(raw.id),
    name: fieldValue(raw.fields, 'company_name') ?? String(raw.id),
    domain: fieldValue(raw.fields, 'website'),
    phone: fieldValue(raw.fields, 'phone'),
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const fields: Record<string, unknown[]> = {}
  if (data.name !== undefined) fields.company_name = [{ value: data.name }]
  if (data.domain !== undefined) fields.website = [{ value: data.domain }]
  if (data.phone !== undefined) fields.phone = [{ value: data.phone }]
  return {
    record_type: 'company',
    fields,
  }
}
