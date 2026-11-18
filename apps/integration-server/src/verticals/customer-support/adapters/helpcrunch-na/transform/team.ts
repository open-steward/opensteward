/**
 * InvGate Service Management — group (team) transform.
 *
 * Group fields from /groups endpoint:
 *   id, name, total (user count)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawInvGateGroup {
  id: number
  name?: string | null
  total?: number | null   // number of users in the group
  [key: string]: unknown
}

export function transformTeam(raw: RawInvGateGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'helpcrunch-na',
    metadata: strMap({ memberCount: raw.total }),
    raw,
  }
}
