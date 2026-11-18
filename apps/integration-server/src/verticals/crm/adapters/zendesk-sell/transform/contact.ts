import type { Contact } from '../../../schema/contact'

export interface RawZendeskSellContact {
  id: number
  first_name?: string
  last_name?: string
  email?: string
  mobile?: string
  title?: string
  is_organization: boolean
  owner_id?: number | null
  organization_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawZendeskSellContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.mobile,
    title: raw.title,
    company_id: raw.organization_id != null ? String(raw.organization_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = { is_organization: false }
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.mobile = data.phone
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.organization_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
