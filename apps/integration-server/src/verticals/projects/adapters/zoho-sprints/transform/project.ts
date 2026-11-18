/**
 * Transforms a raw Zoho Sprints project object into the canonical Project schema.
 *
 * Zoho Sprints project response fields (from GET /zsapi/team/{teamId}/projects/):
 *   projId, name, desc, status (1=Active, 2=Archived), ownerId,
 *   startDate, endDate, createdTime, lastModifiedTime, prefix, projNo
 *
 * status values: 1 = Active, 2 = Archived, 6 = Template
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZohoSprintsProject {
  projId: string
  name?: string
  desc?: string
  status?: number | string
  ownerId?: string
  startDate?: string | number
  endDate?: string | number
  createdTime?: string | number
  lastModifiedTime?: string | number
  prefix?: string
  projNo?: string | number
  teamId?: string
  [key: string]: unknown
}

function mapStatus(raw: RawZohoSprintsProject): ProjectStatus {
  const s = typeof raw.status === 'string' ? parseInt(raw.status, 10) : raw.status
  if (s === 2 || s === 6) return 'archived'
  return 'active'
}

export function transformProject(raw: RawZohoSprintsProject, teamId?: string): Project {
  return {
    id: raw.projId,
    externalId: raw.projId,
    // In Zoho Sprints the "team" is the workspace
    workspaceId: teamId ?? pickStr(raw.teamId) ?? '',
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.desc),
    status: mapStatus(raw),
    ownerId: pickStr(raw.ownerId),
    startDate: toIso(raw.startDate),
    endDate: toIso(raw.endDate),
    createdAt: toIso(raw.createdTime),
    updatedAt: toIso(raw.lastModifiedTime),
    platform: 'zoho-sprints',
    metadata: strMap({
      prefix: raw.prefix,
      projNo: raw.projNo,
    }),
    raw,
  }
}
