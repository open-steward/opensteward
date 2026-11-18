import type { Contact } from '../../../schema/contact'

export interface RawDeskeraContact {
  id: string | number
  name?: string
  email?: string
  mobileNumber?: string
  phone?: string
  designation?: string
  organizationId?: string | number
  ownerId?: string | number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawDeskeraContact): Contact {
  return {
    id: String(raw.id),
    name: raw.name,
    email: raw.email,
    mobile: raw.mobileNumber,
    phone: raw.phone,
    title: raw.designation,
    company_id: raw.organizationId != null ? String(raw.organizationId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.mobile !== undefined) out.mobileNumber = data.mobile
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.designation = data.title
  if (data.company_id !== undefined) out.organizationId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
