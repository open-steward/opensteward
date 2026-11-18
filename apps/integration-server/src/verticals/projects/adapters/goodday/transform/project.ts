import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * GoodDay project object returned by GET /projects and GET /project/{id}.
 *
 * systemStatus values observed: "open", "closed", "cancelled", "on_hold"
 * priority: 0=none, 1=low, 2=medium, 3=high, 4=critical
 */
export interface RawGooddayProject {
  id: string
  name?: string
  description?: string
  startDate?: number | string | null
  endDate?: number | string | null
  deadline?: number | string | null
  moment_created?: number | string | null
  parentProjectId?: string | null
  priority?: number | null
  progress?: number | null
  systemStatus?: string | null
  statusId?: string | null
  statusComments?: string | null
  color?: string | null
  settings?: Record<string, unknown>
  customFieldsData?: unknown
  [key: string]: unknown
}

function mapStatus(raw: RawGooddayProject): ProjectStatus {
  const s = (raw.systemStatus ?? '').toLowerCase()
  if (s === 'closed' || s === 'cancelled' || s === 'canceled') return 'archived'
  if (s === 'on_hold') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawGooddayProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.endDate ?? raw.deadline),
    createdAt: toIso(raw.moment_created),
    updatedAt: undefined,
    platform: 'goodday',
    metadata: strMap({
      parentProjectId: raw.parentProjectId,
      priority: raw.priority,
      progress: raw.progress,
      color: raw.color,
      statusId: raw.statusId,
    }),
    raw,
  }
}
