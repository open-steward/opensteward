/**
 * Missive user → User
 *
 * Missive users (agents/members) are fetched from GET /v1/users.
 * Each user has id, email, first_name, last_name, display_name, and a `me` boolean.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMissiveUser {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
  avatar_url?: string | null
  /** true if this is the authenticated user making the request */
  me?: boolean
  [key: string]: unknown
}

function buildName(raw: RawMissiveUser): string {
  if (raw.display_name) return String(raw.display_name)
  const parts = [raw.first_name, raw.last_name].filter(Boolean)
  return parts.join(' ') || ''
}

export function transformUser(raw: RawMissiveUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: buildName(raw),
    role: undefined,
    teamIds: [],
    platform: 'missive',
    metadata: strMap({
      avatarUrl: raw.avatar_url,
      me: raw.me,
    }),
    raw,
  }
}
