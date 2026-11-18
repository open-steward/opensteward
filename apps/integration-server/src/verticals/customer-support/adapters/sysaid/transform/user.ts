/**
 * Transform SysAid agent → canonical User.
 *
 * SysAid agent fields (Connect API v1: GET /agents):
 *   id, userEmail, userName, firstName, lastName, displayName,
 *   workPhone, mobile, supervisorLevel, isDisabled,
 *   groups (array, expanded via ?expand=groups)
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSysaidAgent {
  id?: number | string
  userEmail?: string
  userName?: string
  firstName?: string
  lastName?: string
  displayName?: string
  workPhone?: string | null
  mobile?: string | null
  supervisorLevel?: number | string | null
  isDisabled?: boolean
  groups?: Array<{ id?: number | string; name?: string }>
  companyId?: number | string | null
  [key: string]: unknown
}

export function transformUser(raw: RawSysaidAgent): User {
  const joinedName = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ')
  const displayName =
    pickStr(raw.displayName) ??
    (joinedName || pickStr(raw.userName)) ??
    ''

  const teamIds = (raw.groups ?? [])
    .map((g) => (g.id !== undefined && g.id !== null ? String(g.id) : undefined))
    .filter((id): id is string => id !== undefined)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.userEmail),
    name: displayName,
    role: raw.supervisorLevel ? 'supervisor' : 'agent',
    teamIds,
    platform: 'sysaid',
    metadata: strMap({
      userName: raw.userName,
      isDisabled: raw.isDisabled,
    }),
    raw,
  }
}
