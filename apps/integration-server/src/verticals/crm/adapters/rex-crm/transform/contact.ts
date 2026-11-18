import type { Contact } from '../../../schema/contact'

export interface RawRexContact {
  id?: number
  first_name?: string
  last_name?: string
  name?: string
  email_addresses?: Array<{ email?: string; type?: string }>
  phone_numbers?: Array<{ phone?: string; type?: string }>
  job_title?: string
  account_id?: number | null
  user_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawRexContact): Contact {
  const firstName = raw.first_name
  const lastName = raw.last_name
  return {
    id: String(raw.id ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: raw.name ?? ([firstName, lastName].filter(Boolean).join(' ') || undefined),
    email: raw.email_addresses?.[0]?.email,
    phone: raw.phone_numbers?.[0]?.phone,
    title: raw.job_title,
    company_id: raw.account_id != null ? String(raw.account_id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email_addresses = [{ email: data.email, type: 'work' }]
  if (data.phone !== undefined) out.phone_numbers = [{ phone: data.phone, type: 'work' }]
  if (data.title !== undefined) out.job_title = data.title
  if (data.company_id !== undefined) out.account_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  return out
}
