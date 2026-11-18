/**
 * Transform eDesk user (agent) raw API response to the canonical User schema.
 *
 * eDesk user fields (v1):
 *   id, name, email, active, username, role
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawEdeskUser {
  id: number | string
  name?: string | null
  email?: string | null
  active?: boolean | null
  username?: string | null
  role?: string | null
  [key: string]: unknown
}

export function transformUser(raw: RawEdeskUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: [],
    platform: 'edesk',
    metadata: strMap({
      username: raw.username,
      active: raw.active,
    }),
    raw,
  }
}
