import type { User } from '../../../schema'
import type { RawWorkboardTeamMember } from './workspace'

/**
 * A WorkBoard user, as documented for GET /wb/apis/user/{user_id}
 * (https://apidocs.myworkboard.com/openapi.json).
 */
export interface RawWorkboardUser {
  user_id?: string
  first_name?: string
  last_name?: string
  email?: string
  [key: string]: unknown
}

function fullName(first: string | undefined, last: string | undefined): string {
  return [first, last].filter((s): s is string => typeof s === 'string' && s !== '').join(' ')
}

export function transformUser(raw: RawWorkboardUser): User {
  if (raw.user_id == null || raw.user_id === '') throw new Error('WorkBoard user has no user_id')
  const id = String(raw.user_id)
  return {
    id,
    externalId: id,
    ...(raw.email ? { email: raw.email } : {}),
    name: fullName(raw.first_name, raw.last_name),
    // The user object documents no team membership.
    workspaceIds: [],
    platform: 'workboard',
    metadata: {},
    raw,
  }
}

/** A member of a team's documented `team_members` array (GET /wb/apis/team?team_id=). */
export function transformTeamMember(raw: RawWorkboardTeamMember, teamId: string): User {
  if (raw.id == null || raw.id === '') throw new Error(`WorkBoard team ${teamId} member has no id`)
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    ...(raw.email ? { email: raw.email } : {}),
    name: fullName(raw.first_name, raw.last_name),
    workspaceIds: [teamId],
    platform: 'workboard',
    metadata: raw.team_role ? { team_role: String(raw.team_role) } : {},
    raw,
  }
}
