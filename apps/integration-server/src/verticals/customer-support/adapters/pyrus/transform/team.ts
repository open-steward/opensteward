/**
 * Pyrus role → canonical Team transform.
 *
 * Pyrus has no "teams" concept but has "roles" that group members.
 * From GET /contacts, roles are nested under organization.roles[].
 * Each role has id, name, member_ids[].
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPyrusRole {
  id?: number
  name?: string
  member_ids?: number[]
  type?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawPyrusRole): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    memberCount: raw.member_ids?.length,
    platform: 'pyrus',
    metadata: strMap({ type: raw.type }),
    raw,
  }
}
