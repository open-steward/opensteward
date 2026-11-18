import type { Contact } from '../../../schema/contact'

export interface RawAgendorContact {
  id: number | string
  name?: string
  email?: string
  mobile?: string
  phone?: string
  organization?: { id: number | string; name?: string } | null
  owner?: { id: number | string } | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawAgendorContact): Contact {
  return {
    id: String(raw.id),
    name: raw.name,
    email: raw.email,
    mobile: raw.mobile,
    phone: raw.phone,
    company_id: raw.organization?.id != null ? String(raw.organization.id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.phone !== undefined) out.phone = data.phone
  if (data.company_id !== undefined) out.organization_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
