/**
 * Ora user transform.
 *
 * Ora API user fields (from GET /projects/:id/members or /user/current):
 *   id, username, full_name, email, created_at
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOraUser {
  id: string | number
  username?: string
  full_name?: string
  email?: string
  [key: string]: unknown
}

export function transformUser(raw: RawOraUser, workspaceId?: string): User {
  const id = String(raw.id)
  const displayName = pickStr(raw.full_name) ?? pickStr(raw.username) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: displayName,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'ora',
    metadata: strMap({ username: raw.username }),
    raw,
  }
}
