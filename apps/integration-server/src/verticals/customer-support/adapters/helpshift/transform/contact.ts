/**
 * Helpshift end-user (contact) transform.
 *
 * Helpshift "users" are end-users who created issues. Key fields:
 *   id             — Helpshift profile ID (string)
 *   name           — display name
 *   emails         — array of email strings
 *   external_user_id — external identifier
 *   phone_number   — optional phone
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpshiftUser {
  id: string | number
  name?: string
  emails?: string[]
  email?: string
  external_user_id?: string | null
  phone_number?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawHelpshiftUser): Contact {
  // Prefer emails array first element, fall back to email field
  const primaryEmail =
    (Array.isArray(raw.emails) && raw.emails.length > 0 ? raw.emails[0] : undefined) ??
    pickStr(raw.email)

  return {
    id: String(raw.id),
    externalId: pickStr(raw.external_user_id) ?? String(raw.id),
    email: primaryEmail ? pickStr(primaryEmail) : undefined,
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone_number),
    platform: 'helpshift',
    metadata: strMap({}),
    raw,
  }
}
