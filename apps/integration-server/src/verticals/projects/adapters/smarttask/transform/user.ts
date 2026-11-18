/**
 * SmartTask user transform.
 *
 * POST /organization-user/filter-users/{organization_id} returns:
 * [{ user_id: number, full_name: string, email: string, role: string, avatar_url: string }]
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSmarttaskUser {
  user_id: number | string
  full_name?: string
  email?: string
  role?: string
  avatar_url?: string
  [key: string]: unknown
}

export function transformUser(raw: RawSmarttaskUser, workspaceId?: string): User {
  const id = String(raw.user_id)
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.full_name) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'smarttask',
    metadata: strMap({ role: raw.role }),
    raw,
  }
}
