/**
 * Transform SysAid group → canonical Team.
 *
 * SysAid group fields (Connect API v1: GET /groups):
 *   id, name, type (general | administrators | endUsers),
 *   email, companyId, supportLevel, canBeAssignedToServiceRecord
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSysaidGroup {
  id?: number | string
  name?: string
  type?: string
  email?: string | null
  companyId?: number | string | null
  supportLevel?: number | null
  canBeAssignedToServiceRecord?: boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawSysaidGroup): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'sysaid',
    metadata: strMap({
      type: raw.type,
      email: raw.email,
      supportLevel: raw.supportLevel,
      canBeAssignedToServiceRecord: raw.canBeAssignedToServiceRecord,
    }),
    raw,
  }
}
