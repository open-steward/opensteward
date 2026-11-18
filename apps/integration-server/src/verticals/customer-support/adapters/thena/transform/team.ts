import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw team shape from GET /v1/teams (TeamResponseDto).
 */
export interface RawThenaTeam {
  id?: string
  name?: string
  description?: string
  identifier?: string
  teamId?: number
  parentTeamId?: string
  parentTeamName?: string
  teamOwner?: string
  teamOwnerId?: string
  isActive?: boolean
  isPrivate?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawThenaTeam): Team {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: pickStr(raw.identifier) ?? id,
    name: pickStr(raw.name) ?? '',
    platform: 'thena',
    metadata: strMap({
      description: raw.description,
      identifier: raw.identifier,
      parentTeamId: raw.parentTeamId,
      parentTeamName: raw.parentTeamName,
      teamOwner: raw.teamOwner,
      isActive: raw.isActive,
      isPrivate: raw.isPrivate,
    }),
    raw,
  }
}
