/**
 * Transform a Smartsupp contact object into the canonical Contact schema.
 *
 * Smartsupp contacts have:
 *   id         — string starting with "ct"
 *   email      — nullable string
 *   name       — nullable string
 *   phone      — nullable string
 *   note       — nullable string
 *   tags       — reference_list of tags associated with this contact
 *   created_at — ISO datetime
 *   updated_at — ISO datetime
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

interface RawSmartsuppContactTagRef {
  type?: string
  id?: string
  url?: string
}

interface RawSmartsuppContactTags {
  type?: string
  data?: RawSmartsuppContactTagRef[]
  total?: number
}

export interface RawSmartsuppContact {
  id: string
  email?: string | null
  name?: string | null
  phone?: string | null
  note?: string | null
  properties?: Record<string, unknown> | null
  gdpr_approved?: boolean
  banned_at?: string | null
  tags?: RawSmartsuppContactTags
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawSmartsuppContact): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    platform: 'smartsupp',
    metadata: strMap({
      note: raw.note,
      gdprApproved: raw.gdpr_approved,
    }),
    raw,
  }
}
