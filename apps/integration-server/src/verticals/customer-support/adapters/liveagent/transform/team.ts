/**
 * LiveAgent Department → canonical Team.
 *
 * Department model fields: department_id, name, agent_count, online_status,
 * agent_ids, mailaccount_id.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLiveagentDepartment {
  department_id?: string
  id?: string
  name?: string
  agent_count?: number | string
  online_status?: string
  agent_ids?: string[]
  mailaccount_id?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawLiveagentDepartment): Team {
  const id = pickStr(raw.department_id) ?? pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    platform: 'liveagent',
    metadata: strMap({
      onlineStatus: raw.online_status,
      agentCount: raw.agent_count,
      mailaccountId: raw.mailaccount_id,
    }),
    raw,
  }
}
