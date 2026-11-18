/**
 * Transform a Rasayel Team into the canonical Team shape.
 *
 * Rasayel Team fields (GraphQL):
 *   id (Int!), uuid (String!), name (String!), emoji (String),
 *   default (Boolean!), isAway (Boolean!), createdAt (Int!), updatedAt (Int)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawRasayelTeam {
  id: number
  uuid?: string
  name?: string
  emoji?: string | null
  default?: boolean
  isAway?: boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawRasayelTeam): Team {
  return {
    id: String(raw.id),
    externalId: raw.uuid ?? String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'rasayel',
    metadata: strMap({ uuid: raw.uuid, emoji: raw.emoji, isAway: raw.isAway }),
    raw,
  }
}
