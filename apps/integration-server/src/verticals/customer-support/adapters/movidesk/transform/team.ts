/**
 * Movidesk (Zenvia Service) team transform.
 *
 * Movidesk does not expose a standalone /teams or /groups endpoint in the
 * public REST API. Teams are surfaced as embedded objects on person records
 * (via $expand=teams) and as ownerTeam strings on tickets.
 *
 * This transform handles the team sub-object shape returned in person expansions.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMovideskTeam {
  id?: number | null
  name?: string | null
  description?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawMovideskTeam): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'movidesk',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
