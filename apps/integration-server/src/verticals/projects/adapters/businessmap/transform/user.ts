/**
 * Businessmap user → canonical User transform.
 *
 * API v2 GET /users  →  { data: [ { user_id, username, email,
 *   first_name, last_name, ... } ] }
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawBusinessmapUser {
  user_id?: number
  username?: string
  email?: string
  first_name?: string
  last_name?: string
  avatar?: string
  is_enabled?: number
  [key: string]: unknown
}

export function transformUser(raw: RawBusinessmapUser, workspaceId?: string): User {
  const id = String(raw.user_id ?? '')
  const fullName =
    [pickStr(raw.first_name), pickStr(raw.last_name)].filter(Boolean).join(' ') ||
    pickStr(raw.username) ||
    ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: fullName,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'businessmap',
    metadata: strMap({
      username: raw.username,
      isEnabled: raw.is_enabled,
    }),
    raw,
  }
}
