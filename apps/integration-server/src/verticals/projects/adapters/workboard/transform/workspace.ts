import type { Workspace } from '../../../schema'
import { requiredName, strMap } from './shared'

/**
 * A WorkBoard team, mapped to the canonical Workspace.
 *
 * Fields as documented for GET /wb/apis/team
 * (https://apidocs.myworkboard.com/openapi.json).
 */
export interface RawWorkboardTeam {
  team_id?: string
  team_name?: string
  /** "functional" or "working_group" */
  team_type?: string
  /** "1" = active or "0" = archived */
  team_state?: string
  parent_team_id?: string
  /** "Only returned on a request where a single team object is returned." */
  team_members?: RawWorkboardTeamMember[]
  [key: string]: unknown
}

/** An entry of a single team's documented `team_members` array. */
export interface RawWorkboardTeamMember {
  id?: string
  first_name?: string
  last_name?: string
  email?: string
  team_role?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawWorkboardTeam): Workspace {
  if (raw.team_id == null || raw.team_id === '') throw new Error('WorkBoard team has no team_id')
  const id = String(raw.team_id)
  return {
    id,
    externalId: id,
    name: requiredName(raw.team_name, 'team', id),
    ...(Array.isArray(raw.team_members) ? { memberCount: raw.team_members.length } : {}),
    platform: 'workboard',
    metadata: strMap({
      team_type: raw.team_type,
      team_state: raw.team_state,
      parent_team_id: raw.parent_team_id,
    }),
    raw,
  }
}
