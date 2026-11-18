/**
 * Weekdone user → canonical User.
 *
 * GET /users returns:
 *   { status: 'ok', users: [{ id, name, picture, admin, team_id,
 *       teams: [{ id, name, observer, admin }], ... }] }
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawWeekdoneUser {
  id: number | string
  name?: string
  email?: string
  picture?: string
  admin?: number | boolean
  team_id?: number | string
  teams?: Array<{ id: number | string; name?: string }>
  [key: string]: unknown
}

export function transformUser(raw: RawWeekdoneUser, workspaceId?: string): User {
  const id = String(raw.id)
  const teamIds = raw.teams?.map((t) => String(t.id)) ?? []
  const fallbackTeamId = raw.team_id != null ? String(raw.team_id) : undefined
  const workspaceIds = workspaceId
    ? [workspaceId]
    : teamIds.length > 0
      ? teamIds
      : fallbackTeamId
        ? [fallbackTeamId]
        : []
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds,
    platform: 'weekdone',
    metadata: strMap({
      admin: raw.admin,
      pictureUrl: raw.picture,
    }),
    raw,
  }
}
