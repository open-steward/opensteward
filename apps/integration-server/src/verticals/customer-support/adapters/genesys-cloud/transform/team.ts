/**
 * Transform a Genesys Cloud routing queue to the canonical Team schema.
 *
 * Genesys Cloud models teams of agents as "routing queues".
 *   GET /api/v2/routing/queues  — list queues
 *   GET /api/v2/routing/queues/{queueId}  — single queue
 *
 * Fields: id, name, description, memberCount, joinedMemberCount,
 *   userMemberCount, divisionId, selfUri.
 *
 * Docs: https://developer.genesys.cloud/routing/routing/
 */
import type { Team } from '../../../schema'
import { pickStr, strMap, pickNum } from './shared'

export interface RawGenesysQueue {
  id?: string
  name?: string
  description?: string
  memberCount?: number
  joinedMemberCount?: number
  userMemberCount?: number
  divisionId?: string
  division?: { id?: string; name?: string } | null
  [key: string]: unknown
}

export function transformTeam(raw: RawGenesysQueue): Team {
  const id = pickStr(raw.id) ?? ''
  const memberCount = pickNum(raw.memberCount)

  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'genesys-cloud',
    metadata: strMap({
      description: raw.description,
      memberCount: memberCount,
      divisionId: raw.divisionId ?? raw.division?.id,
    }),
    raw,
  }
}
