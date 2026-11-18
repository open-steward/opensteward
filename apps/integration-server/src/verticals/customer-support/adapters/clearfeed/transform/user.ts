/**
 * Transform a ClearFeed team-member entry into the canonical User schema.
 *
 * ClearFeed does not expose a dedicated /users or /agents REST endpoint.
 * User identity is represented by Slack user IDs embedded inside team
 * team_members arrays (fetched via GET /v1/rest/teams?include=team_members).
 *
 * Because the member object only contains an ID and a created_at timestamp,
 * the resulting User record will have minimal fields populated.
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawClearfeedMember {
  /** Slack user ID (e.g. "UABC1234"). */
  id?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export function transformUser(raw: RawClearfeedMember, teamId?: string): User {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: id, // Slack user ID is the only identity available without a separate API call.
    teamIds: teamId ? [teamId] : [],
    platform: 'clearfeed',
    metadata: strMap({
      addedAt: toIso(raw.created_at),
    }),
    raw,
  }
}
