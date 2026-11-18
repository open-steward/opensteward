import type { Contact } from '../../../schema/contact'

// Sansan contact — derived from business card scanning
// TODO: Verify field names from https://developer.sansan.com/
export interface RawSansanContact {
  id?: string
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  tel?: string
  mobile?: string
  title?: string
  department?: string
  companyId?: string
  companyName?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSansanContact): Contact {
  const name = raw.name ?? ([raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined)
  return {
    id: String(raw.id ?? ''),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name,
    email: raw.email,
    phone: raw.tel,
    mobile: raw.mobile,
    title: raw.title,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // TODO: Verify write field names from Sansan API docs
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.tel = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.companyId = data.company_id
  return out
}
