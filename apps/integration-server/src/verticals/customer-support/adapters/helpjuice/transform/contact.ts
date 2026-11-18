/**
 * Transform a Helpjuice user (reader/viewer role) into the canonical Contact shape.
 *
 * Helpjuice uses a unified /users endpoint. Contacts are all users regardless of role.
 * The name field is split into first_name / last_name in the API response.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawHelpjuiceUser {
  id: number
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  role_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function buildName(raw: RawHelpjuiceUser): string {
  if (raw.name) return raw.name
  const parts = [raw.first_name, raw.last_name].filter(Boolean)
  return parts.join(' ') || ''
}

export function transformContact(raw: RawHelpjuiceUser): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: buildName(raw),
    platform: 'helpjuice',
    metadata: strMap({
      roleId: raw.role_id,
      createdAt: toIso(raw.created_at),
    }),
    raw,
  }
}
