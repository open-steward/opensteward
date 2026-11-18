import type { Contact } from '../../../schema/contact'

export interface RawSellsyContact {
  id: number | string
  firstname?: string
  lastname?: string
  email?: string
  phone_number?: string
  linked_company_id?: number | string | null
  owner_id?: number | string | null
  created?: string
  updated?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSellsyContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstname,
    last_name: raw.lastname,
    name: [raw.firstname, raw.lastname].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.phone_number,
    company_id: raw.linked_company_id != null ? String(raw.linked_company_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created,
    updated_at: raw.updated,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone_number = data.phone
  if (data.company_id !== undefined) out.linked_company_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
