/**
 * TeamSupport group (team) transform.
 *
 * TeamSupport group fields from /api/json/groups.json:
 *   ID, Name, Description, IsActive.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTeamsupportGroup {
  ID?: number | string
  Name?: string | null
  Description?: string | null
  IsActive?: boolean | string
  [key: string]: unknown
}

export function transformTeam(raw: RawTeamsupportGroup): Team {
  return {
    id: String(raw.ID ?? ''),
    externalId: String(raw.ID ?? ''),
    name: pickStr(raw.Name) ?? '',
    platform: 'teamsupport',
    metadata: strMap({ Description: raw.Description, IsActive: raw.IsActive }),
    raw,
  }
}
