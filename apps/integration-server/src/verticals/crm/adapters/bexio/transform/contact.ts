import type { Contact } from '../../../schema/contact'

// Bexio uses a unified contact model; contact_type_id=2 is a person
export interface RawBexioContact {
  id?: number
  name_1?: string    // first name for persons
  name_2?: string    // last name for persons
  mail?: string
  phone_fixed?: string
  phone_mobile?: string
  contact_group_ids?: number[]
  owner_id?: number
  contact_type_id?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawBexioContact): Contact {
  return {
    id: String(raw.id ?? ''),
    first_name: raw.name_1,
    last_name: raw.name_2,
    name: [raw.name_1, raw.name_2].filter(Boolean).join(' ') || undefined,
    email: raw.mail,
    phone: raw.phone_fixed,
    mobile: raw.phone_mobile,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = { contact_type_id: 2 }
  if (data.first_name !== undefined) out.name_1 = data.first_name
  if (data.last_name !== undefined) out.name_2 = data.last_name
  if (data.email !== undefined) out.mail = data.email
  if (data.phone !== undefined) out.phone_fixed = data.phone
  if (data.mobile !== undefined) out.phone_mobile = data.mobile
  return out
}
