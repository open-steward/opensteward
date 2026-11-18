import type { Contact } from '../../../schema/contact'

export interface RawHighLevelContact {
  id: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  assignedTo?: string
  companyName?: string
  dateAdded?: string
  dateUpdated?: string
  [key: string]: unknown
}

export function transformContact(raw: RawHighLevelContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.phone,
    owner_id: raw.assignedTo,
    created_at: raw.dateAdded,
    updated_at: raw.dateUpdated,
    metadata: raw,
  }
}

export function untransformContact(
  data: Partial<Contact>,
  locationId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { locationId }
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.owner_id !== undefined) out.assignedTo = data.owner_id
  return out
}
