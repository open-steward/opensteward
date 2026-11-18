/**
 * Transform a raw Haptik end-user into the canonical Contact type.
 *
 * Haptik identifies end-users by `auth_id` — an alphanumeric identifier
 * from the integrating system. Additional profile fields are optional.
 *
 * Field mapping:
 *   auth_id    → id / externalId
 *   name       → name
 *   email      → email
 *   mobile_no  → phone
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHaptikUser {
  auth_id: string
  name?: string | null
  email?: string | null
  mobile_no?: string | null
  language_code?: string | null
  device_platform?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawHaptikUser): Contact {
  return {
    id: pickStr(raw.auth_id) ?? String(raw.auth_id),
    externalId: pickStr(raw.auth_id) ?? String(raw.auth_id),
    email: pickStr(raw.email ?? undefined),
    name: pickStr(raw.name ?? undefined) ?? '',
    phone: pickStr(raw.mobile_no ?? undefined),
    platform: 'haptik',
    metadata: strMap({
      languageCode: raw.language_code,
      devicePlatform: raw.device_platform,
    }),
    raw,
  }
}
