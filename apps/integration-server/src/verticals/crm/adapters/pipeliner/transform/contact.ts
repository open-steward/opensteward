import type { Contact } from '../../../schema/contact'

export interface RawPipelinerContact {
  id: string
  first_name?: string
  last_name?: string
  email1?: string
  phone1?: string
  position?: string
  account_id?: string | null
  owner_id?: string | null
  created?: string
  modified?: string
  [key: string]: unknown
}

export function transformContact(raw: RawPipelinerContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: raw.email1,
    phone: raw.phone1,
    title: raw.position,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created,
    updated_at: raw.modified,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email1 = data.email
  if (data.phone !== undefined) out.phone1 = data.phone
  if (data.title !== undefined) out.position = data.title
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
