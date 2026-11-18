import type { Contact } from '../../../schema/contact'

// Kylas CRM contact entity
export interface RawKylasContact {
  id: number
  firstName?: string
  lastName?: string
  name?: string
  email?: string
  phoneNumber?: string
  mobileNumber?: string
  companyId?: number
  ownedBy?: { id?: number }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawKylasContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: raw.name ?? ([raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined),
    email: raw.email,
    phone: raw.phoneNumber,
    mobile: raw.mobileNumber,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    owner_id: raw.ownedBy?.id != null ? String(raw.ownedBy.id) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phoneNumber = data.phone
  if (data.mobile !== undefined) out.mobileNumber = data.mobile
  if (data.company_id !== undefined) out.companyId = Number(data.company_id)
  return out
}
