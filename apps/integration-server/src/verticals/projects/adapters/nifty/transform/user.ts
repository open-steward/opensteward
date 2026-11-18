import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Nifty member (GET /members → `items`). Nifty composes a member's display
 * name from `first_name` / `last_name` (falling back to `name`); `email`
 * carries the login address, `contact_email` the optional secondary one.
 * Subteam membership populates `workspaceIds`.
 */
export interface RawNiftyMember {
  id: string
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  contact_email?: string | null
  avatar?: string | null
  role?: string | null
  team?: string | null
  subteams?: string[] | null
  deactivated?: boolean
  [key: string]: unknown
}

function fullName(raw: RawNiftyMember): string {
  const composed = [pickStr(raw.first_name), pickStr(raw.last_name)]
    .filter(Boolean)
    .join(' ')
    .trim()
  return composed || (pickStr(raw.name) ?? '')
}

export function transformUser(raw: RawNiftyMember, workspaceId?: string): User {
  const workspaceIds = workspaceId
    ? [workspaceId]
    : (raw.subteams ?? []).filter((id): id is string => typeof id === 'string')
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email) ?? pickStr(raw.contact_email),
    name: fullName(raw),
    workspaceIds,
    platform: 'nifty',
    metadata: strMap({
      role: raw.role,
      team: raw.team,
      deactivated: raw.deactivated,
    }),
    raw,
  }
}
