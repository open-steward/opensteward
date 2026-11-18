import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Weeek workspace member shape.
 * Returned by GET /ws/members → { success, members: RawWeeekMember[] }
 */
export interface RawWeeekMember {
  id: string
  email?: string
  logo?: string | null
  lastName?: string | null
  firstName?: string | null
  middleName?: string | null
  position?: string | null
  timeZone?: string
  [key: string]: unknown
}

export function transformUser(raw: RawWeeekMember, workspaceId?: string): User {
  const displayName = [raw.firstName, raw.middleName, raw.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: displayName || raw.id,
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'weeek',
    metadata: strMap({
      logo: raw.logo,
      position: raw.position,
      timeZone: raw.timeZone,
    }),
    raw,
  }
}
