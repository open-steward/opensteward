import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Projectplace project member. Returned by
 * `GET /1/projects/{project_id}/members`. The project id is the canonical
 * workspace id, so it is threaded through from the caller.
 */
export interface RawProjectplaceMember {
  id: number | string
  name?: string
  first_name?: string
  last_name?: string
  email?: string
  role?: string
  type?: string
  [key: string]: unknown
}

export function transformUser(raw: RawProjectplaceMember, workspaceId?: string): User {
  const fullName =
    pickStr(raw.name) ??
    [pickStr(raw.first_name), pickStr(raw.last_name)].filter(Boolean).join(' ')
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName || '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'projectplace',
    metadata: strMap({ role: raw.role, type: raw.type }),
    raw,
  }
}
