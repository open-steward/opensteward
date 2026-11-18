import type { Contact } from '../../../schema/contact'

// TODO: verify endpoint field names from Solve360 REST API
export interface RawSolveContact {
  id?: string | number
  firstname?: string
  lastname?: string
  name?: string
  email?: string
  phone?: string
  mobile?: string
  organisation?: string | null
  assignee?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawSolveContact): Contact {
  return {
    id: String(raw.id ?? ''),
    first_name: raw.firstname,
    last_name: raw.lastname,
    name: raw.name ?? ([raw.firstname, raw.lastname].filter(Boolean).join(' ') || undefined),
    email: raw.email,
    phone: raw.phone,
    mobile: raw.mobile,
    company_id: raw.organisation != null ? String(raw.organisation) : undefined,
    owner_id: raw.assignee != null ? String(raw.assignee) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.organisation = data.company_id
  if (data.owner_id !== undefined) out.assignee = data.owner_id
  return out
}
