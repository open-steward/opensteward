import type { Contact } from '../../../schema/contact'

/**
 * Recruiterflow candidate object (external API).
 *
 * Docs: https://recruiterflow.com/api
 *
 * Key fields:
 *   id             – numeric candidate ID
 *   first_name     – given name
 *   last_name      – family name
 *   name           – full display name
 *   email          – array of { email, is_primary }
 *   phone_number   – array of { number, is_primary }
 *   title          – current job title
 *   organization   – current company name
 *   lead_owner     – { id, name } of owning recruiter
 *   added_time     – ISO-8601 creation timestamp
 *   latest_activity_time – ISO-8601 last-activity timestamp
 */
export interface RawRecruiterflowContact {
  id: string | number
  first_name?: string
  last_name?: string
  name?: string
  email?: Array<{ email?: string; is_primary?: boolean }> | string
  phone_number?: Array<{ number?: string; is_primary?: boolean }> | string
  title?: string
  organization?: string
  lead_owner?: { id?: string | number; name?: string }
  added_time?: string
  latest_activity_time?: string
  [key: string]: unknown
}

function toIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

function primaryEmail(raw: RawRecruiterflowContact): string | undefined {
  if (typeof raw.email === 'string') return raw.email || undefined
  if (Array.isArray(raw.email)) {
    const primary = raw.email.find((e) => e.is_primary) ?? raw.email[0]
    return primary?.email || undefined
  }
  return undefined
}

function primaryPhone(raw: RawRecruiterflowContact): string | undefined {
  if (typeof raw.phone_number === 'string') return raw.phone_number || undefined
  if (Array.isArray(raw.phone_number)) {
    const primary = raw.phone_number.find((p) => p.is_primary) ?? raw.phone_number[0]
    return primary?.number || undefined
  }
  return undefined
}

export function transformContact(raw: RawRecruiterflowContact): Contact {
  const nameParts = [raw.first_name, raw.last_name].filter(Boolean)
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: raw.name ?? (nameParts.length > 0 ? nameParts.join(' ') : undefined),
    email: primaryEmail(raw),
    phone: primaryPhone(raw),
    title: raw.title,
    owner_id: raw.lead_owner?.id !== undefined ? String(raw.lead_owner.id) : undefined,
    created_at: toIso(raw.added_time),
    updated_at: toIso(raw.latest_activity_time),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.email = [{ email: data.email, is_primary: true }]
  if (data.phone !== undefined) out.phone_number = [{ number: data.phone, is_primary: true }]
  if (data.title !== undefined) out.title = data.title
  return out
}
