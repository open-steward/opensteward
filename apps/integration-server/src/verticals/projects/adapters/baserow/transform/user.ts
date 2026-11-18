import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw user object embedded in a workspace response
 * (`GET /api/workspaces/`) or returned by `GET /api/user/`.
 *
 * Response fields (workspace member):
 *   id           – integer user id
 *   name         – display name
 *   email        – user email address
 *   permissions  – permission level within the workspace (ADMIN / MEMBER)
 *   created_on   – ISO-8601 datetime the user joined
 */
export interface RawBaserowUser {
  id?: number | string
  name?: string
  email?: string
  permissions?: string
  created_on?: string
  [key: string]: unknown
}

export function transformUser(raw: RawBaserowUser, workspaceId?: string): User {
  const id = raw.id != null ? String(raw.id) : (pickStr(raw.email) ?? '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'baserow',
    metadata: strMap({
      permissions: raw.permissions,
      createdOn: toIso(raw.created_on),
    }),
    raw,
  }
}
