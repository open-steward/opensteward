/**
 * Pylon Contact → canonical Contact transform.
 *
 * Contact object fields: id, name, email, emails (array),
 * phone_numbers (array), avatar_url, account, custom_fields,
 * external_ids, portal_role.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPylonContact {
  id: string
  name?: string
  email?: string
  emails?: string[]
  phone_numbers?: string[]
  avatar_url?: string | null
  account?: { id?: string; external_ids?: string[] } | null
  custom_fields?: Record<string, unknown>
  external_ids?: string[]
  portal_role?: string
  [key: string]: unknown
}

export function transformContact(raw: RawPylonContact): Contact {
  // Prefer top-level email; fall back to first in emails array
  const email = pickStr(raw.email) ?? (raw.emails && raw.emails.length > 0 ? pickStr(raw.emails[0]) : undefined)
  const phone = raw.phone_numbers && raw.phone_numbers.length > 0 ? pickStr(raw.phone_numbers[0]) : undefined
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email,
    name: pickStr(raw.name) ?? '',
    phone,
    organizationId: raw.account?.id ? pickStr(raw.account.id) : undefined,
    platform: 'gorgias-aircall',
    metadata: strMap({
      portalRole: raw.portal_role,
      avatarUrl: raw.avatar_url,
    }),
    raw,
  }
}
