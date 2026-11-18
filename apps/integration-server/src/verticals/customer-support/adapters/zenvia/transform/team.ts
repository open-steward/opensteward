/**
 * Maps a Zenvia Customer Cloud Group to the canonical Team schema.
 *
 * Groups are the organisational units that hold agents in Zenvia Customer Cloud.
 *
 * API: GET /groups  /  GET /group/{groupId}
 * Docs: https://sales.zenvia.com/#tag/Groups
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZenviaGroup {
  id: string
  name?: string | null
  parentId?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawZenviaGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'zenvia',
    metadata: strMap({ parentId: raw.parentId }),
    raw,
  }
}
