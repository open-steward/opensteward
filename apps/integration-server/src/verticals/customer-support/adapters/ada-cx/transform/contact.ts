/**
 * Ada End User → canonical Contact.
 *
 * GET /api/v2/end-users/ and GET /api/v2/end-users/{end_user_id}
 * (https://docs.ada.cx/reference/end-users/get-end-users,
 * https://docs.ada.cx/reference/end-users/get-end-user-by-id).
 *
 * EndUserProfile documents `first_name`, `last_name`, `display_name`,
 * `avatar`, `email`, `language`, `metadata` and `system_properties`. No phone
 * field is documented, and `metadata` is "A dictionary of arbitrary key, value
 * pairs", so neither is read. `external_id` is "Caller-supplied identifier
 * that links this end user to your own system", not Ada's id, so it goes to
 * metadata rather than `externalId`.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawAdaEndUser {
  end_user_id?: string
  external_id?: string | null
  profile?: {
    first_name?: string | null
    last_name?: string | null
    display_name?: string | null
    avatar?: string | null
    email?: string | null
    language?: string | null
    metadata?: Record<string, unknown>
    system_properties?: Record<string, unknown>
  }
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function contactName(profile: RawAdaEndUser['profile']): string {
  const display = pickStr(profile?.display_name)
  if (display) return display
  return [pickStr(profile?.first_name), pickStr(profile?.last_name)]
    .filter((p): p is string => p !== undefined)
    .join(' ')
}

export function transformContact(raw: RawAdaEndUser): Contact {
  const id = pickStr(raw.end_user_id)
  if (!id) throw new Error('ada-cx: end user has no end_user_id')
  return {
    id,
    externalId: id,
    email: pickStr(raw.profile?.email),
    name: contactName(raw.profile),
    platform: 'ada-cx',
    metadata: strMap({
      language: raw.profile?.language,
      adaExternalId: raw.external_id,
    }),
    raw,
  }
}
