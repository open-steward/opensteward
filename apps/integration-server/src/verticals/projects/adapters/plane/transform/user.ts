import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Plane workspace member as returned by
 * `GET /workspaces/{slug}/members/` and
 * `GET /workspaces/{slug}/members/{memberId}/`.
 *
 * The `member` sub-object contains the actual user identity fields;
 * the wrapper carries the workspace-membership role.
 */
export interface RawPlaneMember {
  id: string
  role?: number | string
  member?: {
    id?: string
    display_name?: string
    first_name?: string
    last_name?: string
    email?: string
    avatar?: string | null
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Derive a human-readable display name from the nested member object. */
function displayName(m: RawPlaneMember['member']): string {
  if (!m) return ''
  if (m.display_name) return String(m.display_name)
  const parts = [m.first_name, m.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return ''
}

export function transformUser(raw: RawPlaneMember, workspaceSlug?: string): User {
  const memberId = raw.member?.id ?? raw.id
  return {
    id: memberId,
    externalId: memberId,
    email: pickStr(raw.member?.email),
    name: displayName(raw.member) || memberId,
    workspaceIds: workspaceSlug ? [workspaceSlug] : [],
    platform: 'plane',
    metadata: strMap({
      membershipId: raw.id,
      role: raw.role,
      avatarUrl: raw.member?.avatar,
    }),
    raw,
  }
}
