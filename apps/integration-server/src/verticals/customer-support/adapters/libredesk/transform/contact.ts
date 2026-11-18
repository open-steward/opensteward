/**
 * Transforms a Libredesk contact (user of type "contact") into the canonical
 * Contact schema.
 *
 * Contacts are fetched from GET /api/v1/contacts. The response shape is the
 * User model with type === "contact".
 *
 * Ref: internal/user/models/models.go (User / UserCompact)
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLibredeskContact {
  id: number
  external_user_id?: string | null
  first_name?: string
  last_name?: string
  email?: string | null
  phone_number?: string | null
  phone_number_country_code?: string | null
  country?: string | null
  type?: string
  enabled?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawLibredeskContact): Contact {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name) ?? ''
  const name = lastName ? `${firstName} ${lastName}`.trim() : firstName

  return {
    id: String(raw.id),
    externalId: pickStr(raw.external_user_id) ?? String(raw.id),
    email: pickStr(raw.email ?? undefined),
    name,
    phone: pickStr(raw.phone_number ?? undefined),
    platform: 'libredesk',
    metadata: strMap({
      country: raw.country,
      phoneCountryCode: raw.phone_number_country_code,
      enabled: raw.enabled,
      createdAt: toIso(raw.created_at),
    }),
    raw,
  }
}
