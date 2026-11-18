import type { Contact } from '../../../schema/contact'

export interface RawTeamwaveContact {
  id: number
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  mobile?: string
  title?: string
  organization_id?: number | null
  owner_id?: number | null
  tags?: string[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawTeamwaveContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: raw.email,
    phone: raw.phone,
    mobile: raw.mobile,
    title: raw.title,
    company_id: raw.organization_id != null ? String(raw.organization_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    tags: raw.tags,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.organization_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
