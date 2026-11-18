import type { Contact } from '../../../schema/contact'

export interface RawSugarContact {
  id: string
  first_name?: string
  last_name?: string
  email1?: string
  phone_work?: string
  title?: string
  account_id?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined
  // SugarCRM dates may or may not have timezone; ensure ISO format
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value
  return `${value}Z`
}

export function transformContact(raw: RawSugarContact): Contact {
  return {
    id: raw.id,
    first_name: raw.first_name || undefined,
    last_name: raw.last_name || undefined,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: raw.email1 || undefined,
    phone: raw.phone_work || undefined,
    title: raw.title || undefined,
    company_id: raw.account_id || undefined,
    owner_id: raw.assigned_user_id || undefined,
    created_at: toIso(raw.date_entered),
    updated_at: toIso(raw.date_modified),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email1 = data.email
  if (data.phone !== undefined) out.phone_work = data.phone
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.account_id = data.company_id
  return out
}
