import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Buildertrend "Job" — the top-level container that all schedule items,
 * to-dos, selections and daily logs hang off. Maps to the canonical Project.
 */
export interface RawBuildertrendJob {
  id: number | string
  jobName?: string
  name?: string
  description?: string
  // Buildertrend job lifecycle: "Presale" | "Open" | "Closed" | "Inactive".
  status?: string
  jobStatus?: string
  builderId?: number | string
  projectManagerId?: number | string
  projectManagerUserId?: number | string
  contractStartDate?: string
  startDate?: string
  projectedFinishDate?: string
  estimatedCompletionDate?: string
  endDate?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

function mapStatus(raw: RawBuildertrendJob): ProjectStatus {
  const v = (raw.status ?? raw.jobStatus ?? '').toLowerCase()
  if (v === 'closed' || v === 'complete' || v === 'completed') return 'completed'
  if (v === 'inactive' || v === 'archived') return 'archived'
  if (v === 'presale' || v === 'pre-sale' || v === 'on hold' || v === 'onhold') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawBuildertrendJob): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: raw.builderId != null ? String(raw.builderId) : '',
    name: pickStr(raw.jobName ?? raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: pickStr(raw.projectManagerId ?? raw.projectManagerUserId),
    startDate: toIso(raw.contractStartDate ?? raw.startDate),
    endDate: toIso(raw.projectedFinishDate ?? raw.estimatedCompletionDate ?? raw.endDate),
    createdAt: toIso(raw.createdDate),
    updatedAt: toIso(raw.modifiedDate),
    platform: 'buildertrend',
    metadata: strMap({
      jobStatus: raw.status ?? raw.jobStatus,
    }),
    raw,
  }
}
