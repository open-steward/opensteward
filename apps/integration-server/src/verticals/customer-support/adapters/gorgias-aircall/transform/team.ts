/**
 * Pylon Team → canonical Team transform.
 *
 * Team object fields: id, name, users (array of { id, email }).
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPylonTeamUser {
  id?: string
  email?: string
  [key: string]: unknown
}

export interface RawPylonTeam {
  id: string
  name?: string
  users?: RawPylonTeamUser[]
  [key: string]: unknown
}

export function transformTeam(raw: RawPylonTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'gorgias-aircall',
    metadata: strMap({
      memberCount: raw.users?.length,
    }),
    raw,
  }
}
