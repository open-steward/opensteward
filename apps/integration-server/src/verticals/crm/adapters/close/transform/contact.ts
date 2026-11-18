import type { Contact } from '../../../schema/contact'

export interface RawCloseContact {
  id: string
  first_name?: string
  last_name?: string
  name?: string
  emails?: Array<{ email: string; type?: string }>
  phones?: Array<{ phone: string; type?: string }>
  lead_id?: string
  created_by_id?: string
  date_created?: string
  date_updated?: string
  title?: string
  [key: string]: unknown
}

export function transformContact(raw: RawCloseContact): Contact {
  return {
    id: raw.id,
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: raw.name ?? ([raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined),
    email: raw.emails?.[0]?.email,
    phone: raw.phones?.[0]?.phone,
    title: raw.title,
    company_id: raw.lead_id,
    owner_id: raw.created_by_id,
    created_at: raw.date_created,
    updated_at: raw.date_updated,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.emails = [{ email: data.email, type: 'office' }]
  if (data.phone !== undefined) out.phones = [{ phone: data.phone, type: 'office' }]
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.lead_id = data.company_id
  return out
}
