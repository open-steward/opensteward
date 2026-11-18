import type { Contact } from '../../../schema/contact'

// TODO: verify field names against Cobra CRM API docs (German/Dutch language)
export interface RawCobraCrmContact {
  id: string | number
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  mobile?: string
  companyId?: string | number | null
  ownerId?: string | number | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformContact(raw: RawCobraCrmContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.firstName ?? undefined,
    last_name: raw.lastName ?? undefined,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    mobile: raw.mobile ?? undefined,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    owner_id: raw.ownerId != null ? String(raw.ownerId) : undefined,
    created_at: raw.createdAt ?? undefined,
    updated_at: raw.updatedAt ?? undefined,
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
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.owner_id !== undefined) out.ownerId = data.owner_id
  return out
}
