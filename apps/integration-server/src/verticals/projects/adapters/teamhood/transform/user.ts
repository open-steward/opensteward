/**
 * Teamhood user → canonical User.
 *
 * GET /api/v1/users → GetUsersResponse {users}.
 * Entities.User: id, firstName, lastName, email, status
 * (Active | Disabled | Invited), lastActivityDate, accessibleWorkspaces (uuid[],
 * nullable).
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawTeamhoodUser {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  status?: string
  lastActivityDate?: string | null
  accessibleWorkspaces?: string[] | null
}

export function transformUser(raw: RawTeamhoodUser): User {
  const fullName = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ')
  const email = pickStr(raw.email)

  return {
    id: raw.id,
    externalId: raw.id,
    email,
    name: fullName || (email ?? ''),
    workspaceIds: raw.accessibleWorkspaces ?? [],
    platform: 'teamhood',
    metadata: strMap({
      status: raw.status,
      lastActivityDate: toIso(raw.lastActivityDate),
    }),
    raw,
  }
}
