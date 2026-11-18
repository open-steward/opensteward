/**
 * Transform HelpDesk (by LiveChat) team to canonical Team.
 *
 * HelpDesk teams have UUID IDs, a name, optional replyName,
 * and optional templateID.
 *
 * Docs: https://api.helpdesk.com/docs#tag/Teams
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpdeskTeam {
  ID?: string | null
  id?: string | null
  name?: string | null
  replyName?: string | null
  replyAddressID?: string | null
  templateID?: string | null
  createdAt?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawHelpdeskTeam): Team {
  const id = pickStr(raw.ID) ?? pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'hellotars-support',
    metadata: strMap({
      replyName: raw.replyName,
      replyAddressID: raw.replyAddressID,
      templateID: raw.templateID,
    }),
    raw,
  }
}
