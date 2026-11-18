/**
 * Wati ↔ canonical Contact transforms.
 *
 * Wati v3 contact shape (GET /api/ext/v3/contacts):
 *   id, wa_id, name, phone, created, last_updated,
 *   contact_status, source, channel_id, channel_type,
 *   opted_in, allow_broadcast, allow_sms,
 *   teams[], segments[], custom_params[{name,value}],
 *   display_name, photo
 *
 * Docs: https://docs.wati.io/reference/get_api-ext-v3-contacts
 */
import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawWatiContact {
  id: string
  wa_id?: string
  name?: string
  phone?: string
  created?: string
  last_updated?: string
  contact_status?: string
  source?: string
  channel_id?: string
  channel_type?: string
  display_name?: string
  photo?: string
  opted_in?: boolean
  allow_broadcast?: boolean
  allow_sms?: boolean
  teams?: string[]
  segments?: string[]
  custom_params?: Array<{ name: string; value?: string }>
  [key: string]: unknown
}

export function transformContact(raw: RawWatiContact): Contact {
  // Wati uses a single `name` string — split best-effort into first/last.
  const fullName = raw.name ?? raw.display_name
  const nameParts = fullName ? fullName.trim().split(/\s+/) : []
  const firstName = nameParts.length > 0 ? nameParts[0] : undefined
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined

  // Phone: Wati stores without '+' prefix; surface as-is (E.164 without '+').
  const phone = typeof raw.phone === 'string' && raw.phone.length > 0
    ? raw.phone
    : undefined

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    phone: phone,
    created_at: toIsoDatetime(raw.created),
    updated_at: toIsoDatetime(raw.last_updated),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  // Wati addContact accepts `name` as a single string.
  if (data.name !== undefined) {
    out.name = data.name
  } else if (data.first_name !== undefined || data.last_name !== undefined) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }

  return out
}
