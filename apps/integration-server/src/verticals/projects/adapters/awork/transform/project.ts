import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** awork project status `type` values (NestedTypeModel.type). */
type AworkProjectStatusType = 'planned' | 'active' | 'progress' | 'closed' | string

export interface RawAworkProjectStatus {
  id?: string
  name?: string
  type?: AworkProjectStatusType
  order?: number
  [key: string]: unknown
}

export interface RawAworkProject {
  id: string
  name?: string
  description?: string | null
  isPrivate?: boolean
  startDate?: string | null
  dueDate?: string | null
  companyId?: string | null
  projectStatusId?: string
  projectStatus?: RawAworkProjectStatus | null
  projectKey?: string | null
  createdOn?: string
  createdBy?: string
  updatedOn?: string
  closedOn?: string | null
  [key: string]: unknown
}

function mapStatus(raw: RawAworkProject): ProjectStatus {
  if (raw.closedOn) return 'archived'
  const type = (raw.projectStatus?.type ?? '').toLowerCase()
  if (type === 'closed') return 'archived'
  if (type === 'planned') return 'on_hold'
  if (type === 'active' || type === 'progress') return 'active'
  return 'active'
}

export function transformProject(raw: RawAworkProject): Project {
  return {
    id: raw.id,
    externalId: raw.id,
    // awork has no separate workspace entity; companies are the closest grouping.
    workspaceId: pickStr(raw.companyId) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.createdBy),
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.dueDate),
    createdAt: toIso(raw.createdOn),
    updatedAt: toIso(raw.updatedOn),
    platform: 'awork',
    metadata: strMap({
      projectStatusId: raw.projectStatusId,
      projectStatusName: raw.projectStatus?.name,
      projectKey: raw.projectKey,
      isPrivate: raw.isPrivate,
    }),
    raw,
  }
}
