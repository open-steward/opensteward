/**
 * ProjectManager project → canonical Project transform.
 *
 * ProjectDto fields (v4):
 *   id (uuid), name, description, shortCode, shortId,
 *   status (ProjectStatusDto: id, name, projectId),
 *   manager (ProjectManagerDto: id, name, email),
 *   startDate, endDate, targetDate, plannedStartDate, plannedFinishDate,
 *   actualStartDate, actualFinishDate, percentComplete,
 *   createDate, modifyDate
 *
 * Docs: https://developer.projectmanager.com/api-reference/project/query-projects
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface RawPmProjectStatus {
  id?: string
  name?: string
}

interface RawPmProjectManager {
  id?: string
  name?: string
  email?: string
}

export interface RawProjectManagerProject {
  id: string
  name?: string
  description?: string | null
  shortCode?: string | null
  shortId?: string | null
  status?: RawPmProjectStatus | null
  manager?: RawPmProjectManager | null
  startDate?: string | null
  endDate?: string | null
  targetDate?: string | null
  plannedStartDate?: string | null
  plannedFinishDate?: string | null
  actualStartDate?: string | null
  actualFinishDate?: string | null
  percentComplete?: number | null
  createDate?: string | null
  modifyDate?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawProjectManagerProject): ProjectStatus {
  const name = (raw.status?.name ?? '').toLowerCase()
  if (name.includes('complet') || name.includes('done') || name.includes('closed') || name.includes('finish')) {
    return 'closed'
  }
  if (name.includes('hold') || name.includes('pause') || name.includes('wait')) {
    return 'on_hold'
  }
  if (name.includes('cancel') || name.includes('archiv') || name.includes('inactive')) {
    return 'archived'
  }
  return 'active'
}

export function transformProject(raw: RawProjectManagerProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    // ProjectManager API keys are workspace-scoped; workspace id is not returned
    // in the project object itself — use empty string as placeholder
    workspaceId: '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description ?? undefined),
    status: mapStatus(raw),
    ownerId: pickStr(raw.manager?.id),
    startDate: toIso(raw.startDate ?? raw.plannedStartDate),
    endDate: toIso(raw.endDate ?? raw.targetDate ?? raw.plannedFinishDate),
    createdAt: toIso(raw.createDate),
    updatedAt: toIso(raw.modifyDate),
    platform: 'projectmanager',
    metadata: strMap({
      shortCode: raw.shortCode,
      shortId: raw.shortId,
      statusName: raw.status?.name,
      percentComplete: raw.percentComplete,
    }),
    raw,
  }
}
