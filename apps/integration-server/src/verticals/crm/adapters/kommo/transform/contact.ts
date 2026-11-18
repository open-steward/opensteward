import type { Contact } from '../../../schema/contact'
import { FIELD_CODE } from '../constants'

interface KommoCustomFieldValue {
  field_id?: number
  field_code?: string
  field_name?: string
  values: Array<{ value: string; enum_id?: number; enum_code?: string }>
}

export interface RawKommoContact {
  id: number
  name?: string
  first_name?: string
  last_name?: string
  responsible_user_id?: number
  company_id?: number
  created_at?: number
  updated_at?: number
  custom_fields_values?: KommoCustomFieldValue[] | null
  [key: string]: unknown
}

/**
 * Extract the first value for a custom field identified by its `field_code`.
 */
function customFieldValue(
  fields: KommoCustomFieldValue[] | null | undefined,
  code: string,
): string | undefined {
  if (!fields) return undefined
  const field = fields.find((f) => f.field_code === code)
  return field?.values?.[0]?.value
}

/**
 * Split a full name into first_name / last_name on the last space.
 * "John" → { first_name: 'John', last_name: undefined }
 * "John van Doe" → { first_name: 'John van', last_name: 'Doe' }
 */
function splitName(name: string | undefined): { first_name?: string; last_name?: string } {
  if (!name) return {}
  const idx = name.lastIndexOf(' ')
  if (idx === -1) return { first_name: name }
  return {
    first_name: name.substring(0, idx),
    last_name: name.substring(idx + 1),
  }
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null || ts === 0) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformContact(raw: RawKommoContact): Contact {
  const nameParts = splitName(raw.name)
  return {
    id: String(raw.id),
    first_name: raw.first_name ?? nameParts.first_name,
    last_name: raw.last_name ?? nameParts.last_name,
    name: raw.name,
    email: customFieldValue(raw.custom_fields_values, FIELD_CODE.EMAIL),
    phone: customFieldValue(raw.custom_fields_values, FIELD_CODE.PHONE),
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    owner_id: raw.responsible_user_id != null ? String(raw.responsible_user_id) : undefined,
    created_at: unixToIso(raw.created_at),
    updated_at: unixToIso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  // Build the full name from parts if both are present, otherwise use whatever is set
  if (data.name !== undefined) {
    out.name = data.name
  } else if (data.first_name || data.last_name) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }

  const customFields: KommoCustomFieldValue[] = []
  if (data.email != null) {
    customFields.push({
      field_code: FIELD_CODE.EMAIL,
      values: [{ value: data.email }],
    })
  }
  if (data.phone != null) {
    customFields.push({
      field_code: FIELD_CODE.PHONE,
      values: [{ value: data.phone }],
    })
  }
  if (customFields.length > 0) out.custom_fields_values = customFields

  if (data.owner_id !== undefined) out.responsible_user_id = Number(data.owner_id)
  if (data.company_id !== undefined) out.company_id = Number(data.company_id)

  return out
}
