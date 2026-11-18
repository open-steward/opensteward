/**
 * Pylon User (agent/member) → canonical User transform.
 *
 * User object fields: id, name, email, emails (array),
 * avatar_url, role_id, status.
 * Team membership is managed via the Teams endpoint (team.users array).
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPylonUser {
  id: string
  name?: string
  email?: string
  emails?: string[]
  avatar_url?: string | null
  role_id?: string
  status?: string
  [key: string]: unknown
}

export function transformUser(raw: RawPylonUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email) ?? (raw.emails && raw.emails.length > 0 ? pickStr(raw.emails[0]) : undefined),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role_id),
    // Team membership is not returned on user objects; use listTeams to discover
    teamIds: [],
    platform: 'gorgias-aircall',
    metadata: strMap({
      status: raw.status,
      avatarUrl: raw.avatar_url,
    }),
    raw,
  }
}
