import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw TAPD Workspace object used as the canonical Project.
 *
 * In TAPD's hierarchy a "workspace" IS a project (it has stories, tasks,
 * iterations, members, etc.).  We map it to the canonical Project schema here.
 *
 * Ref: https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/workspace/
 */
export interface RawTapdProject {
  id: string
  name?: string
  pretty_name?: string
  description?: string
  status?: string
  category?: string
  creator?: string
  creator_id?: string
  created?: string
  begin_date?: string
  end_date?: string
  company_id?: string
  parent_id?: string
  objective?: string
  closed?: string
  [key: string]: unknown
}

function mapStatus(raw: RawTapdProject): ProjectStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (raw.closed === '1' || s === 'closed' || s === 'archived') return 'archived'
  if (s === 'active' || s === '') return 'active'
  return 'active'
}

export function transformProject(raw: RawTapdProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: raw.company_id ?? '',
    name: pickStr(raw.pretty_name ?? raw.name) ?? '',
    description: pickStr(raw.description ?? raw.objective),
    status: mapStatus(raw),
    ownerId: pickStr(raw.creator_id ?? raw.creator),
    startDate: toIso(raw.begin_date),
    endDate: toIso(raw.end_date),
    createdAt: toIso(raw.created),
    updatedAt: undefined,
    platform: 'tapd',
    metadata: strMap({
      category: raw.category,
      parentId: raw.parent_id,
    }),
    raw,
  }
}
