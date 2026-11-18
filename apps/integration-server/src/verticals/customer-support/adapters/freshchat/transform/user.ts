/**
 * Transform a Freshchat agent into the canonical User schema.
 *
 * Freshchat agents are the support staff who respond to conversations.
 * They have first_name + last_name, email, role_id, availability_status,
 * and phone.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreshchatAgent {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  role_id?: string | null
  availability_status?: string | null
  phone?: string | null
  created_time?: string
  [key: string]: unknown
}

function fullName(raw: RawFreshchatAgent): string {
  const parts = [raw.first_name, raw.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : ''
}

export function transformUser(raw: RawFreshchatAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName(raw),
    role: pickStr(raw.role_id),
    teamIds: [],
    platform: 'freshchat',
    metadata: strMap({
      availabilityStatus: raw.availability_status,
      phone: raw.phone,
    }),
    raw,
  }
}
