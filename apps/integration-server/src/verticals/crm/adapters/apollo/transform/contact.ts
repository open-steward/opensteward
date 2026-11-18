import type { Contact } from '../../../schema/contact'

export interface RawApolloContact {
  id: string
  first_name?: string
  last_name?: string
  name?: string
  email?: string
  phone_numbers?: Array<{ sanitized_number?: string; raw_number?: string; type?: string }>
  title?: string
  account_id?: string | null
  owner_id?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawApolloContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: raw.name,
    email: raw.email,
    phone: raw.phone_numbers?.[0]?.sanitized_number ?? raw.phone_numbers?.[0]?.raw_number,
    title: raw.title,
    company_id: raw.account_id ?? undefined,
    owner_id: raw.owner_id ?? undefined,
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
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.account_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
