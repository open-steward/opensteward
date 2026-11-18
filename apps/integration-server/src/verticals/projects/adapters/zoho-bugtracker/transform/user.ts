/**
 * Transform a Zoho BugTracker portal/project user into the canonical User shape.
 *
 * GET /restapi/portal/[PORTALID]/users/
 * GET /restapi/portal/[PORTALID]/projects/[PROJECTID]/users/
 * Docs: https://www.zoho.com/projects/help/rest-api/bugtracker-users-api.html
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZohoBugtrackerUser {
  /** Numeric user ID (may come as string or number) */
  id?: string | number
  /** Zoho-platform user ID */
  zpuid?: string | number
  name?: string
  email?: string
  role?: string
  role_id?: string | number
  role_name?: string
  profile_id?: string | number
  profile_name?: string
  active?: boolean
  [key: string]: unknown
}

export function transformUser(
  raw: RawZohoBugtrackerUser,
  portalId?: string,
): User {
  const id = raw.id != null ? String(raw.id) : (raw.zpuid != null ? String(raw.zpuid) : '')
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: portalId ? [portalId] : [],
    platform: 'zoho-bugtracker',
    metadata: strMap({
      role: raw.role,
      roleName: raw.role_name,
      profileName: raw.profile_name,
      active: raw.active,
    }),
    raw,
  }
}
