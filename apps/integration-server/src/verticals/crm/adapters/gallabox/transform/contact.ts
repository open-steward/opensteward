/**
 * Gallabox ↔ canonical Contact transforms.
 *
 * Gallabox contact shape (GET /accounts/:accountId/contacts/:contactId):
 *   id, accountId, name, email[], phone[], tags[{id,name}],
 *   createdAt, updatedAt, contactOwnerId, formattedPhone[{countryCode,phoneNumber}],
 *   marketingOptIn
 *
 * Docs: https://developers.gallabox.com/gallabox-api/contacts
 */
import type { Contact } from '../../../schema/contact'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawGallaboxContact {
  id: string
  accountId?: string
  name?: string
  /** Array of email strings. */
  email?: string[]
  /** Array of phone strings (E.164 or local). */
  phone?: string[]
  tags?: Array<{ id: string; name: string }>
  createdAt?: string
  updatedAt?: string
  contactOwnerId?: string
  formattedPhone?: Array<{ countryCode?: string; phoneNumber?: string }>
  marketingOptIn?: boolean
  [key: string]: unknown
}

export function transformContact(raw: RawGallaboxContact): Contact {
  // Gallabox stores name as a single string — split into first/last as best-effort.
  const fullName = raw.name ?? undefined
  const nameParts = fullName ? fullName.trim().split(/\s+/) : []
  const firstName = nameParts.length > 0 ? nameParts[0] : undefined
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined

  // Pick the first email and phone from the arrays.
  const email = Array.isArray(raw.email) && raw.email.length > 0
    ? raw.email[0]
    : undefined
  const phone = Array.isArray(raw.phone) && raw.phone.length > 0
    ? raw.phone[0]
    : undefined

  // Tags → string array for the `tags` field.
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => t.name).filter(Boolean)
    : undefined

  return {
    id: String(raw.id),
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: email,
    phone: phone,
    owner_id: raw.contactOwnerId ? String(raw.contactOwnerId) : undefined,
    tags: tags && tags.length > 0 ? tags : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    updated_at: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  // Gallabox uses a single `name` string.
  if (data.name !== undefined) {
    out.name = data.name
  } else if (data.first_name !== undefined || data.last_name !== undefined) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }

  // Gallabox stores emails and phones as arrays.
  if (data.email !== undefined) out.email = [data.email]
  if (data.phone !== undefined) out.phone = [data.phone]

  return out
}
