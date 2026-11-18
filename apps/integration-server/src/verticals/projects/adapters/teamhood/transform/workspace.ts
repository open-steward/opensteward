/**
 * Teamhood workspace → canonical Workspace.
 *
 * GET /api/v1/workspaces              → GetAllWorkspacesResponse {workspaces}
 * GET /api/v1/workspaces/{workspaceId} → Entities.Workspace
 *
 * Entities.Workspace: id (uuid), displayId, title.
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTeamhoodWorkspace {
  id: string
  displayId?: string | null
  title?: string | null
}

export function transformWorkspace(raw: RawTeamhoodWorkspace): Workspace {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.title) ?? '',
    platform: 'teamhood',
    metadata: strMap({ displayId: raw.displayId }),
    raw,
  }
}
