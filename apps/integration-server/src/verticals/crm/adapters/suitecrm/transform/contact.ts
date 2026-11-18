import type { Contact } from '../../../schema/contact'

// SuiteCRM Contact (JSON:API flattened)
export interface RawSuiteCrmContact {
  id?: string
  first_name?: string
  last_name?: string
  full_name?: string
  email1?: string
  phone_work?: string
  phone_mobile?: string
  account_id?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSuiteCrmContact): Contact {
  return {
    id: String(raw.id ?? ''),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: raw.full_name ?? ([raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined),
    email: raw.email1,
    phone: raw.phone_work,
    mobile: raw.phone_mobile,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.assigned_user_id != null ? String(raw.assigned_user_id) : undefined,
    created_at: raw.date_entered,
    updated_at: raw.date_modified,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email1 = data.email
  if (data.phone !== undefined) out.phone_work = data.phone
  if (data.mobile !== undefined) out.phone_mobile = data.mobile
  if (data.company_id !== undefined) out.account_id = data.company_id
  return out
}
