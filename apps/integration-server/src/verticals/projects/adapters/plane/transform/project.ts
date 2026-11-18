import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Plane project.
 * Docs: https://developers.plane.so/api-reference/project/list-projects
 *
 * `network` is 0 (secret) or 2 (public). `identifier` is the short project
 * key (e.g. "PROJ"). Projects carry no lifecycle status field; archived
 * projects expose `archived_at`.
 */
export interface RawPlaneProject {
  id: string
  name?: string
  description?: string
  identifier?: string
  network?: number
  project_lead?: string | null
  workspace?: string
  archived_at?: string | null
  start_date?: string | null
  target_date?: string | null
  created_at?: string
  updated_at?: string
  created_by?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawPlaneProject): ProjectStatus {
  if (raw.archived_at) return 'archived'
  return 'active'
}

export function transformProject(raw: RawPlaneProject, workspaceId?: string): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: workspaceId ?? pickStr(raw.workspace) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.project_lead),
    startDate: toIso(raw.start_date),
    endDate: toIso(raw.target_date),
    createdAt: toIso(raw.created_at),
    updatedAt: toIso(raw.updated_at),
    platform: 'plane',
    metadata: strMap({
      identifier: raw.identifier,
      network: raw.network,
    }),
    raw,
  }
}
