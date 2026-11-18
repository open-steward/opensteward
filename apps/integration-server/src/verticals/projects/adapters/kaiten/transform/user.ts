/**
 * Kaiten user → canonical User.
 *
 * User fields (from GET /users):
 *   id, full_name, email, username, initials, activated,
 *   company_id, role (1=owner, 2=user, 3=deactivated),
 *   created, updated, timezone, lng, external
 *
 * Kaiten users are company-scoped — there is no per-workspace membership
 * concept in the user list endpoint, so workspaceIds stays empty unless a
 * caller forwards a specific space ID.
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawKaitenUser {
  id: number
  full_name?: string
  email?: string
  username?: string
  initials?: string
  activated?: boolean
  company_id?: number
  /** 1=owner, 2=user, 3=deactivated */
  role?: number
  created?: string
  updated?: string
  timezone?: string
  lng?: string
  external?: boolean
  [key: string]: unknown
}

export function transformUser(raw: RawKaitenUser): User {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.full_name) ?? pickStr(raw.username) ?? '',
    workspaceIds: [],
    platform: 'kaiten',
    metadata: strMap({
      username: raw.username,
      initials: raw.initials,
      activated: raw.activated,
      role: raw.role,
      timezone: raw.timezone,
      createdAt: toIso(raw.created),
      updatedAt: toIso(raw.updated),
    }),
    raw,
  }
}
