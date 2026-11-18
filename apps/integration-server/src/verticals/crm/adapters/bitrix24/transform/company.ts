import type { Company } from '../../../schema/company'

export interface RawBitrix24Company {
  ID: string
  TITLE: string
  WEB?: Array<{ VALUE: string; VALUE_TYPE?: string }>
  PHONE?: Array<{ VALUE: string; VALUE_TYPE?: string }>
  ASSIGNED_BY_ID?: string | null
  DATE_CREATE?: string
  DATE_MODIFY?: string
  [key: string]: unknown
}

export function transformCompany(raw: RawBitrix24Company): Company {
  return {
    id: String(raw.ID),
    name: raw.TITLE,
    domain: raw.WEB?.[0]?.VALUE,
    phone: raw.PHONE?.[0]?.VALUE,
    owner_id: raw.ASSIGNED_BY_ID ? String(raw.ASSIGNED_BY_ID) : undefined,
    created_at: raw.DATE_CREATE,
    updated_at: raw.DATE_MODIFY,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (data.name !== undefined) fields.TITLE = data.name
  if (data.domain !== undefined) fields.WEB = [{ VALUE: data.domain, VALUE_TYPE: 'WORK' }]
  if (data.phone !== undefined) fields.PHONE = [{ VALUE: data.phone, VALUE_TYPE: 'WORK' }]
  if (data.owner_id !== undefined) fields.ASSIGNED_BY_ID = data.owner_id
  return fields
}
