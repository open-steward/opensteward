import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Tuleap user object returned by GET /api/users/{id} and embedded in
 * artifact fields such as `submitted_by` and `assigned_to`.
 *
 * Relevant fields:
 *   id           - numeric user identifier
 *   uri          - e.g. "users/101"
 *   display_name - human-readable full name
 *   username     - login username
 *   email        - email address
 *   is_anonymous - boolean
 *   avatar_url   - URL to avatar image
 */
export interface RawTuleapUser {
  id: number
  uri?: string
  display_name?: string
  username?: string
  email?: string
  is_anonymous?: boolean
  avatar_url?: string
  [key: string]: unknown
}

export function transformUser(raw: RawTuleapUser, workspaceId?: string): User {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.display_name) ?? pickStr(raw.username) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'tuleap',
    metadata: strMap({
      username: raw.username,
      isAnonymous: raw.is_anonymous,
      avatarUrl: raw.avatar_url,
      uri: raw.uri,
    }),
    raw,
  }
}
