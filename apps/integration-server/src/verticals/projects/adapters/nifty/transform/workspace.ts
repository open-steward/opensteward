import type { Workspace } from '../../../schema'
import { strMap } from './shared'

/**
 * Nifty subteam / portfolio: SubteamResponse, the rows of GET
 * /api/v1.0/subteams (`{ subteams, items, hasMore }`). Subteams are Nifty's
 * top-level grouping of projects and members, so they map to the canonical
 * workspace.
 */
export interface RawNiftySubteam {
  id: string
  name: string
  initials?: string | null
  logo?: string | null
  color?: string | null
  secondary_color?: string | null
  is_general?: boolean
  owner?: string | null
  members?: string[] | null
  [key: string]: unknown
}

export function transformWorkspace(raw: RawNiftySubteam): Workspace {
  // `name` is required by SubteamResponse; never substitute an empty string.
  if (typeof raw.name !== 'string') {
    throw new Error(`Nifty subteam ${raw.id} has no name`)
  }
  return {
    id: raw.id,
    externalId: raw.id,
    name: raw.name,
    memberCount: Array.isArray(raw.members) ? raw.members.length : undefined,
    platform: 'nifty',
    metadata: strMap({
      initials: raw.initials,
      color: raw.color,
      isGeneral: raw.is_general,
      owner: raw.owner,
    }),
    raw,
  }
}
