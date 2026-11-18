import type { Contact } from '../../../schema/contact'

/** Nimble field array entry */
interface NimbleFieldValue {
  value?: string
  label?: string
  modifier?: string
}

export interface RawNimbleContact {
  id: string
  type?: string
  fields?: Record<string, NimbleFieldValue[]>
  company_name?: string
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

export function transformContact(raw: RawNimbleContact): Contact {
  return {
    id: String(raw.id),
    first_name: fieldValue(raw.fields, 'first_name'),
    last_name: fieldValue(raw.fields, 'last_name'),
    name: [fieldValue(raw.fields, 'first_name'), fieldValue(raw.fields, 'last_name')]
      .filter(Boolean)
      .join(' ') || undefined,
    email: fieldValue(raw.fields, 'email'),
    phone: fieldValue(raw.fields, 'phone'),
    title: fieldValue(raw.fields, 'title'),
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const fields: Record<string, unknown[]> = {}
  if (data.first_name !== undefined) fields.first_name = [{ value: data.first_name }]
  if (data.last_name !== undefined) fields.last_name = [{ value: data.last_name }]
  if (data.email !== undefined) fields.email = [{ value: data.email }]
  if (data.phone !== undefined) fields.phone = [{ value: data.phone }]
  if (data.title !== undefined) fields.title = [{ value: data.title }]
  return {
    record_type: 'person',
    fields,
  }
}
