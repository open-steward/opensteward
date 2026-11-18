/**
 * Toggl Plan workspace/group transform.
 *
 * Toggl Plan's top-level account context is a workspace identified by a
 * numeric ID (present in every URL). There is no standalone "list workspaces"
 * endpoint — the workspace ID is supplied at credential time. We synthesise a
 * single Workspace object from the stored workspaceId and a name derived from
 * the /me response (passed in as raw).
 *
 * Groups (GET /{workspace_id}/groups) are sub-divisions within a workspace and
 * are mapped to Workspace objects when listing.
 *
 * Docs: https://developers.plan.toggl.com/api-v5.html
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTogglPlanGroup {
  id: number | string
  name?: string
  memberships?: Array<{
    id: number | string
    user_id: number | string
    position?: number
    weight?: number
    created_at?: string
    updated_at?: string
  }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawTogglPlanGroup, workspaceId?: string): Workspace {
  const id = String(raw.id)
  const memberIds = (raw.memberships ?? []).map((m) => String(m.user_id))
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    memberCount: memberIds.length,
    platform: 'toggl-plan',
    metadata: strMap({
      parentWorkspaceId: workspaceId,
      memberIds: memberIds.join(','),
    }),
    raw,
  }
}
