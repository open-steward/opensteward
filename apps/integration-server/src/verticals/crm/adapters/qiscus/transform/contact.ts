import type { Contact } from '../../../schema/contact'

// Qiscus "Customer" entity — individual contacts in Qiscus CRM
// TODO: verify exact field names from API response
export interface RawQiscusContact {
  id: string | number
  name?: string
  email?: string
  phone?: string
  additional_info?: Array<{ field_name: string; value?: unknown }>
  avatar?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function getAdditionalField(raw: RawQiscusContact, fieldName: string): string | undefined {
  const field = raw.additional_info?.find((f) => f.field_name === fieldName)
  return field?.value != null ? String(field.value) : undefined
}

export function transformContact(raw: RawQiscusContact): Contact {
  return {
    id: String(raw.id),
    name: raw.name,
    email: raw.email ?? getAdditionalField(raw, 'email'),
    phone: raw.phone ?? getAdditionalField(raw, 'phone'),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  return out
}
