import type { Contact } from '../../../schema/contact'

export interface RawCopperContact {
  id: number
  name?: string
  emails?: Array<{ email: string; category?: string }>
  phone_numbers?: Array<{ number: string; category?: string }>
  title?: string
  company_id?: number | null
  assignee_id?: number | null
  date_created?: number
  date_modified?: number
  [key: string]: unknown
}

function splitName(name: string | undefined): { first_name?: string; last_name?: string } {
  if (!name) return {}
  const trimmed = name.trim()
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace === -1) return { first_name: trimmed }
  return {
    first_name: trimmed.substring(0, lastSpace),
    last_name: trimmed.substring(lastSpace + 1),
  }
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformContact(raw: RawCopperContact): Contact {
  const { first_name, last_name } = splitName(raw.name)
  return {
    id: String(raw.id),
    first_name,
    last_name,
    name: raw.name,
    email: raw.emails?.[0]?.email,
    phone: raw.phone_numbers?.[0]?.number,
    title: raw.title,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    owner_id: raw.assignee_id != null ? String(raw.assignee_id) : undefined,
    created_at: unixToIso(raw.date_created),
    updated_at: unixToIso(raw.date_modified),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // Copper uses a single name field
  if (data.name !== undefined) {
    out.name = data.name
  } else if (data.first_name || data.last_name) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }
  if (data.email !== undefined) out.emails = [{ email: data.email, category: 'work' }]
  if (data.phone !== undefined) out.phone_numbers = [{ number: data.phone, category: 'work' }]
  if (data.title !== undefined) out.title = data.title
  if (data.company_id !== undefined) out.company_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.assignee_id = Number(data.owner_id)
  return out
}
