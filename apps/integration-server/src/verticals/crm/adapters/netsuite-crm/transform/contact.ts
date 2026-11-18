import type { Contact } from '../../../schema/contact'

export interface RawNetsuiteContact {
  id: string | number
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobilePhone?: string
  company?: { id: string | number } | null
  owner?: { id: string | number } | null
  dateCreated?: string
  lastModifiedDate?: string
  [key: string]: unknown
}

export function transformContact(raw: RawNetsuiteContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName ?? undefined,
    last_name: raw.lastName ?? undefined,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobilePhone ?? undefined,
    company_id: raw.company?.id != null ? String(raw.company.id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.dateCreated ?? undefined,
    updated_at: raw.lastModifiedDate ?? undefined,
    metadata: raw,
  }
}
