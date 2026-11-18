/**
 * Maps a Zenvia Customer Cloud Agent to the canonical User schema.
 *
 * Agents are the staff members who handle customer interactions.
 *
 * API: GET /agents
 * Docs: https://sales.zenvia.com/#tag/Agents
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZenviaAgent {
  id: string
  name?: string | null
  email?: string | null
  role?: string | null
  groupId?: string | null
  active?: boolean | null
  [key: string]: unknown
}

export function transformUser(raw: RawZenviaAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: raw.groupId ? [String(raw.groupId)] : [],
    platform: 'zenvia',
    metadata: strMap({ active: raw.active }),
    raw,
  }
}
