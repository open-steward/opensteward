import type { Contact } from '../../../schema/contact'

export interface RawClientifyContact {
  id: string | number
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  mobile?: string
  company?: string | number | null
  owner?: string | number | null
  date_added?: string
  date_modified?: string
  [key: string]: unknown
}

export function transformContact(raw: RawClientifyContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobile ?? undefined,
    company_id: raw.company != null ? String(raw.company) : undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: raw.date_added ?? undefined,
    updated_at: raw.date_modified ?? undefined,
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
  if (data.company_id !== undefined) out.company = data.company_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
