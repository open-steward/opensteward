import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw application object returned by `GET /api/applications/` or
 * `GET /api/applications/{id}/`.
 *
 * In Baserow, an "application" is the top-level container (type=database).
 * We map it to a canonical Project because it is the natural project-level
 * grouping above tables/rows.
 *
 * Response fields:
 *   id         – integer application id
 *   name       – application display name
 *   order      – sort order integer
 *   type       – "database" (or other plugin types, e.g. "builder")
 *   workspace  – { id, name } — parent workspace reference
 *   tables     – array of table stubs (may be absent on list; present on get)
 */
export interface RawBaserowApplication {
  id: number | string
  name?: string
  order?: number | string
  type?: string
  workspace?: { id?: number | string; name?: string }
  tables?: Array<{ id?: number | string; name?: string }>
  [key: string]: unknown
}

function mapStatus(_raw: RawBaserowApplication): ProjectStatus {
  // Baserow databases have no archived/status field — always active.
  return 'active'
}

export function transformProject(raw: RawBaserowApplication): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: raw.workspace?.id != null ? String(raw.workspace.id) : '',
    name: pickStr(raw.name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'baserow',
    metadata: strMap({
      type: raw.type,
      order: raw.order,
      tableCount: raw.tables?.length,
    }),
    raw,
  }
}
