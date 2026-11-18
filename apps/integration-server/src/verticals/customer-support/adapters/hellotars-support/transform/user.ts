/**
 * Transform HelpDesk (by LiveChat) agent to canonical User.
 *
 * HelpDesk agent roles: "owner" | "normal" | "viewer"
 * These map to canonical role strings directly.
 *
 * Docs: https://api.helpdesk.com/docs#tag/Agents
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpdeskAgent {
  ID?: string | null
  id?: string | null
  name?: string | null
  email?: string | null
  /** roles array: ["owner"] | ["normal"] | ["viewer"] */
  roles?: string[] | null
  /** Teams this agent belongs to */
  teamIDs?: string[] | null
  status?: string | null
  jobTitle?: string | null
  [key: string]: unknown
}

export function transformUser(raw: RawHelpdeskAgent): User {
  const id = pickStr(raw.ID) ?? pickStr(raw.id) ?? ''
  // Use the first role as the canonical role string
  const role = raw.roles && raw.roles.length > 0 ? pickStr(raw.roles[0]) : undefined
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role,
    teamIds: raw.teamIDs ?? [],
    platform: 'hellotars-support',
    metadata: strMap({
      status: raw.status,
      jobTitle: raw.jobTitle,
    }),
    raw,
  }
}
