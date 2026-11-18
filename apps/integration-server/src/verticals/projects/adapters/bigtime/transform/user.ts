import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * BigTime staff member (`GET /staff`, `GET /staff/detail/{StaffSid}`).
 *
 * BigTime has no workspace concept (a firm is the tenant), so `workspaceIds`
 * carries the firm id when known. Name is assembled from `FName` + `SName`.
 */
export interface RawBigtimeStaff {
  StaffSid?: number | string
  FName?: string
  SName?: string
  FullName?: string
  EMail?: string
  Title?: string
  IsInactive?: boolean
  GroupNm?: string
  StaffOrgId?: number | string
  ManagerID?: number | string
  DtCreated?: string
  DtModified?: string
  [key: string]: unknown
}

function buildName(raw: RawBigtimeStaff): string {
  const full = pickStr(raw.FullName)
  if (full) return full
  const parts = [pickStr(raw.FName), pickStr(raw.SName)].filter(Boolean)
  return parts.join(' ')
}

/** BigTime emails are plain strings; drop anything not email-shaped. */
function pickEmail(raw: RawBigtimeStaff): string | undefined {
  const email = pickStr(raw.EMail)
  if (email && email.includes('@')) return email
  return undefined
}

export function transformUser(raw: RawBigtimeStaff, firmId?: string): User {
  const id = pickStr(raw.StaffSid) ?? ''
  return {
    id,
    externalId: id,
    email: pickEmail(raw),
    name: buildName(raw),
    workspaceIds: firmId ? [firmId] : [],
    platform: 'bigtime',
    metadata: strMap({
      title: raw.Title,
      groupName: raw.GroupNm,
      staffOrgId: raw.StaffOrgId,
      managerId: raw.ManagerID,
      isInactive: raw.IsInactive,
    }),
    raw,
  }
}
