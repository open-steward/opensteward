/**
 * Transform a raw Take Blip team/queue object to the canonical Team schema.
 *
 * Teams (service queues) in Take Blip Desk are referenced by name rather than
 * a numeric ID. The name is used as both id and externalId.
 *
 * Teams are listed via:
 *   GET /teams  (via postmaster@desk.msging.net)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTakeBlipTeam {
  id?: string | number
  name?: string
  agentLimit?: number | null
  queuePassTime?: number | null
  isActive?: boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawTakeBlipTeam): Team {
  // Teams may only have a name as identifier
  const teamId = pickStr(raw.id) ?? pickStr(raw.name) ?? ''

  return {
    id: teamId,
    externalId: teamId,
    name: pickStr(raw.name) ?? teamId,
    platform: 'take-blip',
    metadata: strMap({
      agentLimit: raw.agentLimit,
      queuePassTime: raw.queuePassTime,
      isActive: raw.isActive,
    }),
    raw,
  }
}
