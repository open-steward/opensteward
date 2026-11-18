/**
 * Chaskiq team → canonical Team.
 *
 * TeamType fields: id, name.
 * Chaskiq does not expose a description on the team object.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Raw TeamType from Chaskiq GraphQL. */
export interface RawChaskiqTeam {
  id?: string | null
  name?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawChaskiqTeam): Team {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'chaskiq',
    metadata: strMap({}),
    raw,
  }
}
