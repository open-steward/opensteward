import type { Contact } from '../../../schema/contact'

// TODO: verify endpoint field names from ACT! CRM REST API
export interface RawActContact {
  id?: string
  contactId?: string
  firstName?: string
  lastName?: string
  fullName?: string
  emailAddress?: string
  phone?: string
  mobilePhone?: string
  companyId?: string | null
  managerId?: string | null
  created?: string | null
  edited?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawActContact): Contact {
  const id = raw.id ?? raw.contactId ?? ''
  return {
    id: String(id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: raw.fullName ?? ([raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined),
    email: raw.emailAddress,
    phone: raw.phone,
    mobile: raw.mobilePhone,
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    owner_id: raw.managerId != null ? String(raw.managerId) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.edited ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.emailAddress = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobilePhone = data.mobile
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.owner_id !== undefined) out.managerId = data.owner_id
  return out
}
