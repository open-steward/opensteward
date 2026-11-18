/**
 * Pyrus member (user/agent) → canonical User transform.
 *
 * From GET /members and GET /members/{id}.
 * Pyrus members have first_name, last_name, email, position, status, banned.
 * There is no "role" concept; `position` is the closest equivalent.
 * Pyrus has no team concept mapped to members; teamIds is always [].
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPyrusMember {
  id?: number
  first_name?: string
  last_name?: string
  email?: string
  position?: string
  status?: string
  banned?: boolean
  type?: string
  [key: string]: unknown
}

export function transformUser(raw: RawPyrusMember): User {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name) ?? ''
  const name = [firstName, lastName].filter(Boolean).join(' ') || ''

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.email),
    name,
    role: pickStr(raw.position) ?? pickStr(raw.type),
    teamIds: [],  // Pyrus members are not assigned to teams via this endpoint
    platform: 'pyrus',
    metadata: strMap({
      status: raw.status,
      banned: raw.banned,
    }),
    raw,
  }
}
