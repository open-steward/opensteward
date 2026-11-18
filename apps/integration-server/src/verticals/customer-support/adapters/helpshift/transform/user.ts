/**
 * Helpshift agent (User) transform.
 *
 * Helpshift agents are retrieved from GET /{domain}/agents. Key fields:
 *   id              — Helpshift profile ID (string)
 *   name            — display name
 *   email           — primary email
 *   role_name       — role description string (e.g. "Admin", "Agent")
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpshiftAgent {
  id: string | number
  name?: string
  email?: string
  role_name?: string
  [key: string]: unknown
}

export function transformUser(raw: RawHelpshiftAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role_name),
    teamIds: [],
    platform: 'helpshift',
    metadata: strMap({}),
    raw,
  }
}
