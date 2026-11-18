import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Respond.io user (agent/team member) object.
 *
 * The API does not expose a standalone users list endpoint in v2.
 * User objects appear in conversation assignee context and webhook payloads.
 */
export interface RawRespondIoUser {
  id: number
  name?: string | null
  email?: string | null
  role?: string | null
  teamIds?: number[] | null
  [key: string]: unknown
}

export function transformUser(raw: RawRespondIoUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? String(raw.id),
    role: pickStr(raw.role),
    teamIds: (raw.teamIds ?? []).map(String),
    platform: 'respond-io',
    metadata: strMap({}),
    raw,
  }
}
