import type { Contact } from '../../../schema/contact'

// CorporateStack contact entity
// TODO: verify exact field names from API response
export interface RawCorporateStackContact {
  id: string | number
  first_name?: string
  last_name?: string
  name?: string
  email?: string
  phone?: string
  mobile?: string
  company_id?: string | number
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawCorporateStackContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: raw.name ?? ([raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined),
    email: raw.email,
    phone: raw.phone,
    mobile: raw.mobile,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.company_id = data.company_id
  return out
}
