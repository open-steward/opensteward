/**
 * UseDesk agent (user) transform.
 *
 * Agents come from POST /uapi/users (https://api.usedocs.com/article/51414),
 * whose "Server response parameters" are: id — "Agent ID"; name — "Agent's
 * name"; email — "Agent's Email"; position — "Agent position"; role — "Role
 * of the agent"; phone — "Agent's phone number"; online_status — "Online
 * status of the agent in tickets"; chat_online_status — "Online status of the
 * agent in chats"; groups — "An array of groups the agent is a member of",
 * each with id — "Group ID".
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUsedeskAgentGroup {
  id?: number | string
  name?: string
  [key: string]: unknown
}

export interface RawUsedeskAgent {
  id?: number | string
  name?: string | null
  email?: string | null
  position?: string | null
  role?: string | null
  phone?: string | null
  online_status?: string | number | null
  chat_online_status?: string | number | null
  groups?: RawUsedeskAgentGroup[] | null
  [key: string]: unknown
}

export function transformUser(raw: RawUsedeskAgent): User {
  if (raw.id == null || raw.id === '') throw new Error('UseDesk agent has no id')
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    // The documented sample sends empty strings for unset fields ("position": "").
    email: raw.email || undefined,
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: (raw.groups ?? [])
      .map((g) => (g.id == null ? '' : String(g.id)))
      .filter((g) => g !== ''),
    platform: 'usedesk',
    metadata: strMap({
      position: raw.position || undefined,
      phone: raw.phone,
      onlineStatus: raw.online_status,
      chatOnlineStatus: raw.chat_online_status,
    }),
    raw,
  }
}
