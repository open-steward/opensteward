import type { Contact } from '../../../schema/contact'

export interface RawVtigerContact {
  id: string
  firstname?: string
  lastname?: string
  salutationtype?: string
  email?: string
  phone?: string
  title?: string
  accountid?: string
  assigned_user_id?: string
  createdtime?: string
  modifiedtime?: string
  [key: string]: unknown
}

export function transformContact(raw: RawVtigerContact): Contact {
  const nameParts = [raw.firstname, raw.lastname].filter(Boolean)
  return {
    id: String(raw.id),
    first_name: raw.firstname,
    last_name: raw.lastname,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: raw.email,
    phone: raw.phone,
    title: raw.title,
    company_id: raw.accountid ? String(raw.accountid) : undefined,
    owner_id: raw.assigned_user_id ? String(raw.assigned_user_id) : undefined,
    created_at: raw.createdtime,
    updated_at: raw.modifiedtime,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.accountid = data.company_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  return out
}
