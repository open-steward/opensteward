/**
 * Transform a ClearFeed team object into the canonical Team schema.
 *
 * API: GET /v1/rest/teams, GET /v1/rest/teams/:id
 * Supports optional include=team_members to embed member IDs.
 *
 * ClearFeed team fields:
 *  - id         → id / externalId
 *  - name       → name
 *  - is_active  → metadata
 *  - source     → metadata (e.g. "slack")
 *  - source_id  → metadata (Slack group ID)
 *  - team_members[].id → memberIds (Slack user IDs)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawClearfeedTeam {
  id: number | string
  name?: string | null
  is_active?: boolean | null
  source?: string | null
  source_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  team_members?: Array<{ id?: string | null; created_at?: string | null }> | null
  [key: string]: unknown
}

export function transformTeam(raw: RawClearfeedTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'clearfeed',
    metadata: strMap({
      isActive: raw.is_active,
      source: raw.source,
      sourceId: raw.source_id,
    }),
    raw,
  }
}
