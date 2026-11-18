/**
 * Talkdesk Team → canonical Team transform.
 *
 * Talkdesk Teams API field reference:
 *   teamId       — UUID string (note: Talkdesk uses 'teamId' not 'id' for teams)
 *   name         — string
 *   description  — string | null
 *   userIds      — string[] (member agent IDs)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTalkdeskTeam {
  teamId?: string | null
  id?: string | null
  name?: string | null
  description?: string | null
  userIds?: string[] | null
  [key: string]: unknown
}

export function transformTeam(raw: RawTalkdeskTeam): Team {
  // Talkdesk returns either 'teamId' or 'id' depending on the endpoint version
  const id = pickStr(raw.teamId) ?? pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'talkdesk',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
