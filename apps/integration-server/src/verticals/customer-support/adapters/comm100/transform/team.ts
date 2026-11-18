/**
 * Comm100 departments → canonical Teams.
 *
 * https://developer.comm100.com/docs/server-api-global-setting-department,
 * Department JSON Format: id, name, description, isAvailableInLiveChat,
 * isAvailableInTicketingAndMessaging, agentIds ("Id of the selected agents for
 * this department."), isDeleted.
 */
import type { Team } from '../../../schema'
import { pickStr, required, strMap } from './shared'

export interface RawComm100Department {
  id?: string
  name?: string
  description?: string
  isAvailableInLiveChat?: boolean
  isAvailableInTicketingAndMessaging?: boolean
  agentIds?: string[] | null
  isDeleted?: boolean
  [key: string]: unknown
}

export function transformTeam(raw: RawComm100Department): Team {
  const id = required(pickStr(raw.id), 'department id')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    memberCount: Array.isArray(raw.agentIds) ? raw.agentIds.length : undefined,
    platform: 'comm100',
    metadata: strMap({
      description: raw.description,
      isAvailableInLiveChat: raw.isAvailableInLiveChat,
      isAvailableInTicketingAndMessaging: raw.isAvailableInTicketingAndMessaging,
      isDeleted: raw.isDeleted,
    }),
    raw,
  }
}
