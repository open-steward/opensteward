import type { Company } from '../../../schema/company'
import { FIELD_CODE } from '../constants'

interface KommoCustomFieldValue {
  field_code?: string
  values: Array<{ value: string }>
}

export interface RawKommoCompany {
  id: number
  name: string
  responsible_user_id?: number
  created_at?: number
  updated_at?: number
  custom_fields_values?: KommoCustomFieldValue[] | null
  [key: string]: unknown
}

function customFieldValue(
  fields: KommoCustomFieldValue[] | null | undefined,
  code: string,
): string | undefined {
  if (!fields) return undefined
  const field = fields.find((f) => f.field_code === code)
  return field?.values?.[0]?.value
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null || ts === 0) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformCompany(raw: RawKommoCompany): Company {
  return {
    id: String(raw.id),
    name: raw.name,
    domain: customFieldValue(raw.custom_fields_values, FIELD_CODE.SITE),
    phone: customFieldValue(raw.custom_fields_values, FIELD_CODE.PHONE),
    owner_id: raw.responsible_user_id != null ? String(raw.responsible_user_id) : undefined,
    created_at: unixToIso(raw.created_at),
    updated_at: unixToIso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (data.name !== undefined) out.name = data.name
  if (data.owner_id !== undefined) out.responsible_user_id = Number(data.owner_id)

  const customFields: Array<{ field_code: string; values: Array<{ value: string }> }> = []
  if (data.domain !== undefined) {
    customFields.push({ field_code: FIELD_CODE.SITE, values: [{ value: data.domain }] })
  }
  if (data.phone !== undefined) {
    customFields.push({ field_code: FIELD_CODE.PHONE, values: [{ value: data.phone }] })
  }
  if (customFields.length > 0) out.custom_fields_values = customFields

  return out
}
