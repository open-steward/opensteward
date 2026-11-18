import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * GoodDay user object returned by GET /users and GET /user/{id}.
 */
export interface RawGooddayUser {
  id: string
  name?: string | null
  primaryEmail?: string | null
  companyRole?: string | null
  isAdmin?: boolean | null
  momentCreated?: number | string | null
  reportsToUserId?: string | null
  departmentId?: string | null
  departmentName?: string | null
  [key: string]: unknown
}

export function transformUser(raw: RawGooddayUser): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.primaryEmail),
    name: pickStr(raw.name) ?? '',
    workspaceIds: [],
    platform: 'goodday',
    metadata: strMap({
      companyRole: raw.companyRole,
      isAdmin: raw.isAdmin,
      reportsToUserId: raw.reportsToUserId,
      departmentId: raw.departmentId,
      departmentName: raw.departmentName,
      createdAt: toIso(raw.momentCreated),
    }),
    raw,
  }
}
