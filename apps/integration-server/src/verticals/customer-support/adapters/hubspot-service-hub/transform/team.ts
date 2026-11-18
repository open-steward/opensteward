/**
 * HubSpot Service Hub team transform.
 *
 * listTeams comes from GET /settings/v3/users/teams (`PublicTeam`):
 *   id, name, userIds (primary members), secondaryUserIds.
 * getTeam comes from GET /settings/teams/2026-09/{teamId} (`TeamResponse`):
 *   id, name, parentTeamId — no member lists, so primaryMemberCount and
 *   secondaryMemberCount come back empty for a single-team fetch. Both
 *   responses share the same HubSpot team id space, so one transform
 *   handles either shape; the fields the other API doesn't send are just
 *   absent and drop out of `metadata` via strMap.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHubspotTeam {
  id: string
  name?: string
  userIds?: (string | number)[]
  secondaryUserIds?: (string | number)[]
  parentTeamId?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawHubspotTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'hubspot-service-hub',
    metadata: strMap({
      primaryMemberCount: raw.userIds?.length,
      secondaryMemberCount: raw.secondaryUserIds?.length,
      parentTeamId: raw.parentTeamId,
    }),
    raw,
  }
}
