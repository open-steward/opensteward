import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Nutcache project member — maps to canonical User.
 *
 * Key fields from GET /webapi/projects/{id}/project_members:
 *   id, member (org member id), name, email, display_color,
 *   status (0=Inactive, 1=Active), project, billing_rate
 */
export interface RawNutcacheMember {
  id: number
  member?: number
  name?: string
  email?: string
  display_color?: string
  status?: number
  project?: number
  billing_rate?: number
  type?: string
  [key: string]: unknown
}

export function transformUser(raw: RawNutcacheMember, workspaceId?: string): User {
  const id = raw.member != null ? String(raw.member) : String(raw.id)
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'nutcache',
    metadata: strMap({
      projectMemberId: raw.id,
      displayColor: raw.display_color,
      memberStatus: raw.status,
      projectId: raw.project,
    }),
    raw,
  }
}
