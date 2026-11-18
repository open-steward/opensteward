import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso, isTruthy, tagNames } from './shared'

/**
 * Float project. Numeric ids ride the wire as integers; canonical ids are
 * stringified. Float has no "workspace" — projects are grouped under a client,
 * so `client_id` maps to the canonical `workspaceId`.
 */
export interface RawFloatProject {
  project_id: number | string
  name?: string
  project_code?: string | null
  client_id?: number | string | null
  color?: string | null
  notes?: string | null
  tags?: unknown
  status?: number | string | null
  non_billable?: number | boolean
  tentative?: number | boolean
  active?: number | boolean
  project_manager?: number | string | null
  budget_type?: number | null
  start_date?: string | null
  end_date?: string | null
  created?: string | null
  modified?: string | null
  [key: string]: unknown
}

/**
 * Float projects don't model a rich lifecycle. `active: 0` is archived;
 * otherwise the project is active. Float's numeric `status`/`tentative` flags
 * describe scheduling intent rather than completion, so they ride in metadata.
 */
function mapStatus(raw: RawFloatProject): ProjectStatus {
  if (raw.active != null && !isTruthy(raw.active)) return 'archived'
  return 'active'
}

export function transformProject(raw: RawFloatProject): Project {
  const id = String(raw.project_id)
  return {
    id,
    externalId: id,
    workspaceId: raw.client_id != null ? String(raw.client_id) : '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.notes),
    status: mapStatus(raw),
    ownerId: raw.project_manager != null ? String(raw.project_manager) : undefined,
    startDate: toIso(raw.start_date),
    endDate: toIso(raw.end_date),
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.modified),
    platform: 'float',
    metadata: strMap({
      color: raw.color,
      projectCode: raw.project_code,
      status: raw.status,
      tentative: raw.tentative,
      nonBillable: raw.non_billable,
      tags: tagNames(raw.tags).join(',') || undefined,
    }),
    raw,
  }
}
