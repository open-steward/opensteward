import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * One contact as GET /v1/contacts/ (`data.items[]`) and
 * GET /v1/contacts/{contactId} (`data`) return it.
 *
 * Fields from https://getdex.com/docs/api-reference/reference/v1/contacts/list-contacts
 * ("data.items[].id string (uuid) required", "data.items[].first_name string | null",
 * "data.items[].full_name string | null", "data.items[].job_title string | null",
 * "data.items[].created_at string (date-time)", "data.items[].updated_at string (date-time)",
 * "data.items[].contact_emails array<object>", "data.items[].contact_phone_numbers array<object>").
 *
 * The response schema leaves the `contact_emails` / `contact_phone_numbers`
 * row shape open; the rows' fields are the ones the same API documents for them
 * on write (POST /v1/contacts/ and PUT /v1/contacts/{contactId} request bodies:
 * contact_emails {email, label, ranking}, contact_phone_numbers {phone_number,
 * country_code, phone_number_sanitized, label, ranking}) and on read in
 * GET /v2/contacts/birthdays (contact_emails {id, email}).
 */
export interface RawDexContact {
  id: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  job_title?: string | null
  company?: string | null
  contact_emails?: Array<{ email?: string | null; label?: string | null }>
  contact_phone_numbers?: Array<{ phone_number?: string | null; label?: string | null }>
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawDexContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    name: raw.full_name ?? undefined,
    email: raw.contact_emails?.[0]?.email ?? undefined,
    phone: raw.contact_phone_numbers?.[0]?.phone_number ?? undefined,
    title: raw.job_title ?? undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.title !== undefined) out.job_title = data.title
  if (data.email !== undefined) out.emails = [{ email: data.email, label: 'work' }]
  if (data.phone !== undefined) out.phones = [{ phone_number: data.phone, label: 'work' }]
  return out
}
