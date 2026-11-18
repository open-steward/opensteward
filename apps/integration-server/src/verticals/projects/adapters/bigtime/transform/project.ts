import type { Project, ProjectStatus } from '../../../schema'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * BigTime project (`GET /project`, `GET /project/detail/{SystemId}`).
 *
 * Fields vary by view: the `Basic` list carries `SystemId`, `Nm`,
 * `ProjectCode`, `DisplayName`, `Notes`, `ClientId` and the date fields;
 * the `Detailed` view adds `IsInactive`, `StatusProd`, `TypeId`, etc.
 */
export interface RawBigtimeProject {
  SystemId?: number | string
  Nm?: string
  DisplayName?: string
  ProjectCode?: string
  Notes?: string
  ClientId?: number | string
  ClientNm?: string
  IsInactive?: boolean
  StatusProd?: number | string
  ProjectMgr?: number | string
  StartDt?: string
  EndDt?: string
  DtCreated?: string
  DtModified?: string
  [key: string]: unknown
}

function mapStatus(raw: RawBigtimeProject): ProjectStatus {
  if (raw.IsInactive === true) return 'archived'
  return 'active'
}

export function transformProject(raw: RawBigtimeProject, firmId?: string): Project {
  const id = pickStr(raw.SystemId) ?? ''
  return {
    id,
    externalId: id,
    workspaceId: firmId ?? '',
    name: pickStr(raw.Nm) ?? pickStr(raw.DisplayName) ?? '',
    description: pickStr(raw.Notes),
    status: mapStatus(raw),
    ownerId: pickStr(raw.ProjectMgr),
    startDate: toIso(raw.StartDt),
    endDate: toIso(raw.EndDt),
    createdAt: toIso(raw.DtCreated),
    updatedAt: toIso(raw.DtModified),
    platform: 'bigtime',
    metadata: strMap({
      projectCode: raw.ProjectCode,
      displayName: raw.DisplayName,
      clientId: pickNum(raw.ClientId),
      clientName: raw.ClientNm,
      statusProd: raw.StatusProd,
    }),
    raw,
  }
}
