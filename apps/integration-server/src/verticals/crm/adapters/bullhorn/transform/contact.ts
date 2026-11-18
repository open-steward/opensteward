import type { Contact } from '../../../schema/contact'

// Bullhorn "ClientContact" entity — individual contacts/candidates
export interface RawBullhornContact {
  id: number
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phone?: string
  mobile?: string
  clientCorporation?: { id?: number }
  owner?: { id?: number }
  dateAdded?: number
  dateLastModified?: number
  [key: string]: unknown
}

export function transformContact(raw: RawBullhornContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: raw.name ?? ([raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined),
    email: raw.email,
    phone: raw.phone,
    mobile: raw.mobile,
    company_id: raw.clientCorporation?.id != null ? String(raw.clientCorporation.id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.dateAdded != null ? new Date(raw.dateAdded).toISOString() : undefined,
    updated_at: raw.dateLastModified != null ? new Date(raw.dateLastModified).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.clientCorporation = { id: Number(data.company_id) }
  if (data.owner_id !== undefined) out.owner = { id: Number(data.owner_id) }
  return out
}
