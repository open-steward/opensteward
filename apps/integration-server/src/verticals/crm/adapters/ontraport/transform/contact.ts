import type { Contact } from '../../../schema/contact'

export interface RawOntraportContact {
  id: string
  firstname?: string
  lastname?: string
  email?: string
  office_phone?: string
  cell_phone?: string
  company_id?: string | null
  owner?: string | null
  date?: string | null
  dlm?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawOntraportContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstname,
    last_name: raw.lastname,
    name: [raw.firstname, raw.lastname].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.office_phone,
    mobile: raw.cell_phone,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    owner_id: raw.owner != null ? String(raw.owner) : undefined,
    created_at: raw.date ?? undefined,
    updated_at: raw.dlm ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.office_phone = data.phone
  if (data.mobile !== undefined) out.cell_phone = data.mobile
  if (data.company_id !== undefined) out.company_id = data.company_id
  if (data.owner_id !== undefined) out.owner = data.owner_id
  return out
}
