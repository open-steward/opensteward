/**
 * Kayako team → canonical Team transform.
 *
 * Teams are returned from GET /api/v1/teams.json and GET /api/v1/teams/:id.json.
 * The team `title` field is the human-readable name.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKayakoTeam {
  id: number
  legacy_id?: string | null
  title?: string
  member_count?: number
  [key: string]: unknown
}

export function transformTeam(raw: RawKayakoTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.legacy_id ?? raw.id),
    name: pickStr(raw.title) ?? '',
    platform: 'kayako',
    metadata: strMap({ memberCount: raw.member_count }),
    raw,
  }
}
