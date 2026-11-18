import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw workspace object returned by `GET /api/workspaces/`.
 *
 * Response fields (Baserow v2+):
 *   id           – integer workspace id
 *   name         – workspace display name
 *   permissions  – caller's permission level (ADMIN / MEMBER)
 *   users        – array of workspace members (embedded)
 */
export interface RawBaserowWorkspace {
  id: number | string
  name?: string
  permissions?: string
  users?: Array<{ id?: number | string; name?: string; email?: string; permissions?: string; created_on?: string }>
  [key: string]: unknown
}

export function transformWorkspace(raw: RawBaserowWorkspace): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'baserow',
    metadata: strMap({
      permissions: raw.permissions,
      memberCount: raw.users?.length,
    }),
    raw,
  }
}
