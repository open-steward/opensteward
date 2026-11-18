/**
 * SmartTask project transform.
 *
 * POST /project/list/{organization_id}/{archive_flag} returns:
 *   { ProjectId: string, Name: string }
 *
 * archive_flag=0 → active, archive_flag=1 → archived
 */
import type { Project, ProjectStatus } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSmarttaskProject {
  /** UUID string */
  ProjectId: string
  Name?: string
  /** 0 = active, 1 = archived — passed as a synthetic field by the adapter */
  _archived?: boolean
  /** organization_id injected by the adapter */
  _organizationId?: string
  [key: string]: unknown
}

function mapStatus(raw: RawSmarttaskProject): ProjectStatus {
  if (raw._archived) return 'archived'
  return 'active'
}

export function transformProject(raw: RawSmarttaskProject, organizationId?: string): Project {
  const id = pickStr(raw.ProjectId) ?? ''
  return {
    id,
    externalId: id,
    workspaceId: raw._organizationId ?? organizationId ?? '',
    name: pickStr(raw.Name) ?? '',
    description: undefined,
    status: mapStatus(raw),
    ownerId: undefined,
    startDate: undefined,
    endDate: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    platform: 'smarttask',
    metadata: strMap({}),
    raw,
  }
}
