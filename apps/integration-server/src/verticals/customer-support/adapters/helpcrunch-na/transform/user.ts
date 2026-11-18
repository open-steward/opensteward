/**
 * InvGate Service Management — agent (user) transform.
 *
 * Agents share the same /user endpoint as end-users; the 'role' field
 * indicates 'admin', 'agent', 'observer', etc.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawInvGateAgent {
  id: number
  name?: string | null
  email?: string | null
  username?: string | null
  role?: string | null
  group_id?: number | null    // primary group
  [key: string]: unknown
}

export function transformUser(raw: RawInvGateAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? pickStr(raw.username) ?? '',
    role: pickStr(raw.role),
    teamIds: raw.group_id != null ? [String(raw.group_id)] : [],
    platform: 'helpcrunch-na',
    metadata: strMap({ username: raw.username }),
    raw,
  }
}
