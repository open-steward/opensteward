/**
 * ConnectWise PSA member (agent/user) transform.
 *
 * Source endpoint: GET /system/members, GET /system/members/{identifier}
 *
 * Key fields:
 *   id, identifier (login), firstName, lastName, emailAddress,
 *   defaultDepartmentId (maps to a team-like concept),
 *   inactiveFlag, systemFlag, licenseClass
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCwMember {
  id: number
  /** Login username (≤15 chars) */
  identifier?: string
  firstName?: string
  lastName?: string
  emailAddress?: string
  /** Security role */
  securityRole?: { id?: number; name?: string } | null
  defaultDepartmentId?: number | null
  /** true if the member is disabled/inactive */
  inactiveFlag?: boolean
  /** true for system admin accounts */
  systemFlag?: boolean
  /** License class: F=Full, A=API-only, C=Limited, etc. */
  licenseClass?: string
  _info?: {
    lastUpdated?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function transformUser(raw: RawCwMember): User {
  const firstName = pickStr(raw.firstName) ?? ''
  const lastName = pickStr(raw.lastName) ?? ''
  const name = [firstName, lastName].filter(Boolean).join(' ')

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.emailAddress),
    name,
    role: pickStr(raw.securityRole?.name),
    teamIds: raw.defaultDepartmentId ? [String(raw.defaultDepartmentId)] : [],
    platform: 'connectwise-psa',
    metadata: strMap({
      identifier: raw.identifier,
      licenseClass: raw.licenseClass,
      inactiveFlag: raw.inactiveFlag,
      systemFlag: raw.systemFlag,
    }),
    raw,
  }
}
