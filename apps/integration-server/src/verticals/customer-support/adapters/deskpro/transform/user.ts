/**
 * Deskpro agent (user) transform.
 *
 * Endpoint: GET /api/v2/agents
 * Response envelope: { data: [...] }
 *
 * Agents have a primary_email like contacts. The team (department) membership
 * is available via the teams[] or agent_teams[] field when sideloaded.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Deskpro agent object as returned inside response.data for
 * GET /api/v2/agents and GET /api/v2/agents/{id}.
 */
export interface RawDeskproAgent {
  id: number
  name?: string
  /** Primary email — may be an object or a plain string */
  primary_email?: { email?: string } | string | null
  /** Agent permission/role label */
  agent_teams?: Array<{ id?: number }> | null
  [key: string]: unknown
}

function extractEmail(primary: RawDeskproAgent['primary_email']): string | undefined {
  if (primary == null) return undefined
  if (typeof primary === 'string') return primary || undefined
  return pickStr((primary as { email?: string }).email)
}

function extractTeamIds(teams: RawDeskproAgent['agent_teams']): string[] {
  if (!Array.isArray(teams)) return []
  return teams.flatMap((t) => {
    const id = (t as { id?: number }).id
    return id != null && id > 0 ? [String(id)] : []
  })
}

export function transformUser(raw: RawDeskproAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: extractEmail(raw.primary_email),
    name: pickStr(raw.name) ?? '',
    role: 'agent',
    teamIds: extractTeamIds(raw.agent_teams),
    platform: 'deskpro',
    metadata: strMap({}),
    raw,
  }
}
