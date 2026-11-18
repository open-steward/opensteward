/**
 * Missive team → Team
 *
 * Missive teams are fetched from GET /v1/teams.
 * Each team has an id and name; additional fields may be present.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawMissiveTeam {
  id: string
  name?: string | null
  organization?: { id?: string; [key: string]: unknown } | null
  [key: string]: unknown
}

export function transformTeam(raw: RawMissiveTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'missive',
    metadata: strMap({
      organizationId: raw.organization?.id,
    }),
    raw,
  }
}
