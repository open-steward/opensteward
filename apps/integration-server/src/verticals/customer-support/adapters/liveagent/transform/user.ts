/**
 * LiveAgent Agent → canonical User.
 *
 * Agent model fields: id, name, email, role, role_id, avatar_url,
 * online_status, status, gender, last_pswd_change, twofactor_auth,
 * voice_status, sip_phone_id, api_phone_id.
 *
 * role values: A (admin), O (owner), R (agent/representative).
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLiveagentAgent {
  id?: string
  name?: string
  email?: string
  role?: string
  role_id?: string
  avatar_url?: string
  online_status?: string
  status?: string
  gender?: string
  [key: string]: unknown
}

function mapRole(r: string | undefined): string | undefined {
  if (!r) return undefined
  switch (r.toUpperCase()) {
    case 'A':
      return 'admin'
    case 'O':
      return 'owner'
    case 'R':
      return 'agent'
    default:
      return pickStr(r)
  }
}

export function transformUser(raw: RawLiveagentAgent): User {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: mapRole(raw.role),
    teamIds: [], // LiveAgent does not return department membership on the Agent object
    platform: 'liveagent',
    metadata: strMap({
      roleId: raw.role_id,
      onlineStatus: raw.online_status,
      status: raw.status,
    }),
    raw,
  }
}
