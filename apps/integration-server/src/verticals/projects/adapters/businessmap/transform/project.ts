/**
 * Businessmap board → canonical Project transform.
 *
 * A Businessmap "board" is the project-level container.
 * API v2 GET /boards  →  { data: [ { board_id, workspace_id, name,
 *   description, is_archived, revision } ] }
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, pickNum, strMap, toIso } from './shared'

export interface RawBusinessmapBoard {
  board_id?: number
  workspace_id?: number
  name?: string
  description?: string
  is_archived?: number
  revision?: number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawBusinessmapBoard): ProjectStatus {
  if (raw.is_archived === 1) return 'archived'
  return 'active'
}

export function transformProject(raw: RawBusinessmapBoard): Project {
  const id = String(raw.board_id ?? '')
  return {
    id,
    externalId: id,
    workspaceId: String(raw.workspace_id ?? ''),
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'businessmap',
    metadata: strMap({
      revision: pickNum(raw.revision),
    }),
    raw,
  }
}
