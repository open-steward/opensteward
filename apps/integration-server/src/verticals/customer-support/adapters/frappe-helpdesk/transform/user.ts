/**
 * Transform an HD Agent (Frappe Helpdesk) into the canonical User schema.
 *
 * Key HD Agent fields:
 *   name           — document ID (matches User doctype name, usually email)
 *   agent_name     — display name
 *   user           — link to User (email)
 *   is_active      — boolean
 *   availability   — link to HD Agent Status
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFrappeAgent {
  name: string
  agent_name?: string
  user?: string | null
  is_active?: number | boolean
  availability?: string | null
  [key: string]: unknown
}

export function transformUser(raw: RawFrappeAgent): User {
  // In Frappe, the HD Agent name is the User record name (typically email)
  const email = pickStr(raw.user) ?? raw.name
  return {
    id: raw.name,
    externalId: raw.name,
    email,
    name: pickStr(raw.agent_name) ?? raw.name,
    role: 'agent',
    teamIds: [],
    platform: 'frappe-helpdesk',
    metadata: strMap({ isActive: raw.is_active, availability: raw.availability }),
    raw,
  }
}
