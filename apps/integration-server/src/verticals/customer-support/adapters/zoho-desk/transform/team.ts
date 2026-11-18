/**
 * Zoho Desk team → canonical Team.
 *
 * Fields from GET /api/v1/teams and GET /api/v1/teams/{team_id}
 * (https://desk.zoho.com/DeskAPIDocument, Teams): `id`, `name`,
 * `description`, `departmentId`, `agents` (direct members) and
 * `derivedAgents` (members through roles). A ticket's `teamId` points here.
 * `memberCount` counts the distinct ids of both lists.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZohoDeskTeam {
  id: string | number
  name?: string | null
  description?: string | null
  departmentId?: string | null
  agents?: Array<string | number> | null
  derivedAgents?: Array<string | number> | null
  [key: string]: unknown
}

export function transformTeam(raw: RawZohoDeskTeam): Team {
  const id = String(raw.id)
  const hasMembers = Array.isArray(raw.agents) || Array.isArray(raw.derivedAgents)
  const members = new Set([...(raw.agents ?? []), ...(raw.derivedAgents ?? [])].map(String))
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    memberCount: hasMembers ? members.size : undefined,
    platform: 'zoho-desk',
    metadata: strMap({ departmentId: raw.departmentId, description: raw.description }),
    raw,
  }
}
