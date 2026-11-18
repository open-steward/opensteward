import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Shape returned by GET /projects and GET /projects/{projectId}.
 *
 * Rocketlane uses numeric IDs internally; they are coerced to strings at the
 * canonical layer. Field names follow camelCase in the API response.
 */
export interface RawRocketlaneProject {
  projectId?: number | string
  projectName?: string
  description?: string
  status?: string // e.g. "ACTIVE", "COMPLETED", "ON_HOLD", "ARCHIVED"
  startDate?: string // ISO-8601 date
  dueDate?: string // ISO-8601 date
  customerId?: number | string
  ownerId?: number | string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(raw: RawRocketlaneProject): ProjectStatus {
  const s = (raw.status ?? '').toString().toUpperCase()
  if (s === 'COMPLETED') return 'completed'
  if (s === 'ARCHIVED') return 'archived'
  if (s === 'ON_HOLD') return 'on_hold'
  return 'active'
}

export function transformProject(raw: RawRocketlaneProject): Project {
  const id = String(raw.projectId ?? '')
  return {
    id,
    externalId: id,
    workspaceId: raw.customerId != null ? String(raw.customerId) : '',
    name: pickStr(raw.projectName) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.ownerId != null ? String(raw.ownerId) : undefined,
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.dueDate),
    createdAt: toIso(raw.createdAt),
    updatedAt: toIso(raw.updatedAt),
    platform: 'rocketlane',
    metadata: strMap({ status: raw.status }),
    raw,
  }
}
