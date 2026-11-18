import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw user object returned by Kanboard's getUser / getAllUsers.
 *
 * Docs: https://docs.kanboard.org/v1/api/user_procedures/
 */
export interface RawKanboardUser {
  id: string | number
  username?: string
  name?: string
  email?: string
  role?: string
  is_ldap_user?: boolean | string | number
  notifications_enabled?: boolean | string | number
  [key: string]: unknown
}

export function transformUser(raw: RawKanboardUser, projectId?: string): User {
  const id = String(raw.id)

  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? pickStr(raw.username) ?? '',
    // Kanboard has no workspace concept; pass projectId as a pseudo-workspace
    // so consumers can scope users back to their project.
    workspaceIds: projectId ? [projectId] : [],
    platform: 'kanboard',
    metadata: strMap({
      username: raw.username,
      role: raw.role,
      isLdapUser: raw.is_ldap_user,
    }),
    raw,
  }
}
