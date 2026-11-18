import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * NocoDB "base" maps to a canonical Project.
 *
 * Response from:
 *   GET /api/v2/meta/workspaces/{workspaceId}/bases
 *   GET /api/v2/meta/bases/{baseId}
 *
 * Key fields: id (prefixed `p`), title, type, status, fk_workspace_id,
 *   created_at, updated_at
 */
export interface RawNocodbBase {
  id: string
  title?: string
  type?: string
  status?: string | null
  fk_workspace_id?: string
  color?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: RawNocodbBase): ProjectStatus {
  if (raw.status === 'archived') return 'archived'
  if (raw.status === 'active' || !raw.status) return 'active'
  return 'active'
}

export function transformProject(raw: RawNocodbBase): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: raw.fk_workspace_id ?? '',
    name: pickStr(raw.title) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'nocodb',
    metadata: strMap({
      type: raw.type,
      color: raw.color,
    }),
    raw,
  }
}
