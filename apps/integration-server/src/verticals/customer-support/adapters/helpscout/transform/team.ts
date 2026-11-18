/**
 * Help Scout team → canonical Team.
 *
 * Fields from the List Teams response docs:
 * https://developer.helpscout.com/mailbox-api/endpoints/teams/list-teams/
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpScoutTeam {
  id: number
  name?: string
  mention?: string
  timezone?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawHelpScoutTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'helpscout',
    metadata: strMap({
      mention: raw.mention,
      timezone: raw.timezone,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }),
    raw,
  }
}
