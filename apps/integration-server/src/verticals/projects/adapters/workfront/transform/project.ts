import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/** Raw Workfront `project` (objCode `PROJ`) record. */
export interface RawWorkfrontProject {
  ID: string
  name?: string
  description?: string
  status?: string
  ownerID?: string
  groupID?: string
  plannedStartDate?: string
  plannedCompletionDate?: string
  entryDate?: string
  lastUpdateDate?: string
  percentComplete?: number
  [key: string]: unknown
}

/**
 * Workfront system project status codes:
 *   CUR Current · PLN Planning · IDA On Hold (Idea/Requested) ·
 *   CPL Complete · DED Dead · REJ Rejected.
 */
function mapStatus(status: string | undefined): ProjectStatus {
  switch (status) {
    case 'CUR':
      return 'active'
    case 'CPL':
      return 'completed'
    case 'DED':
    case 'REJ':
      return 'archived'
    case 'PLN':
    case 'IDA':
      return 'on_hold'
    default:
      return 'unknown'
  }
}

export function transformProject(raw: RawWorkfrontProject): Project {
  return {
    id: raw.ID,
    externalId: raw.ID,
    workspaceId: pickStr(raw.groupID) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    status: mapStatus(raw.status),
    ownerId: pickStr(raw.ownerID),
    startDate: toIso(raw.plannedStartDate),
    endDate: toIso(raw.plannedCompletionDate),
    createdAt: toIso(raw.entryDate),
    updatedAt: toIso(raw.lastUpdateDate),
    platform: 'workfront',
    metadata: strMap({
      statusCode: raw.status,
      percentComplete: raw.percentComplete,
    }),
    raw,
  }
}
