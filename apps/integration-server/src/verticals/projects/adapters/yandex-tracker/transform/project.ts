import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Yandex Tracker project object from GET /v3/projects.
 * Docs: https://yandex.ru/support/tracker/en/api-ref/projects/get-projects
 */
export interface RawYandexTrackerProject {
  id: string
  key?: string
  name?: string
  description?: string
  lead?: { id: string; display?: string } | null
  status?: string
  startDate?: string
  endDate?: string
  [key: string]: unknown
}

function mapStatus(raw: RawYandexTrackerProject): ProjectStatus {
  switch (raw.status) {
    case 'LAUNCHED':
      return 'active'
    case 'IN_PROGRESS':
      return 'active'
    case 'POSTPONED':
      return 'on_hold'
    case 'DRAFT':
      return 'on_hold'
    default:
      return 'active'
  }
}

export function transformProject(raw: RawYandexTrackerProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: '',
    name: pickStr(raw.name) ?? pickStr(raw.key) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw),
    ownerId: raw.lead ? pickStr(raw.lead.id) : undefined,
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.endDate),
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'yandex-tracker',
    metadata: strMap({ key: raw.key, trackerStatus: raw.status }),
    raw,
  }
}
