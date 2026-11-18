/**
 * Teamhood board → canonical Project.
 *
 * GET /api/v1/workspaces/{workspaceId}/boards → GetBoardsResponse {boards}.
 * Entities.Board: id (uuid), displayId, title, isPrivate. A board carries no
 * workspace id, status or dates, so the workspace comes from the request that
 * listed it and the status is 'unknown'.
 */
import type { Project } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTeamhoodBoard {
  id: string
  displayId?: string | null
  title?: string | null
  isPrivate?: boolean | null
}

export function transformProject(raw: RawTeamhoodBoard, workspaceId: string): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId,
    name: pickStr(raw.title) ?? '',
    status: 'unknown',
    platform: 'teamhood',
    metadata: strMap({
      displayId: raw.displayId,
      isPrivate: raw.isPrivate,
    }),
    raw,
  }
}
