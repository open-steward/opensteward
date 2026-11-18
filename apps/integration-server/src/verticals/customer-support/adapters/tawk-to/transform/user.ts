/**
 * Transform a raw tawk.to agent (from /agent.me) into the canonical User schema.
 *
 * tawk.to agent fields:
 *   _id        — agent identifier
 *   fullName   — agent's full name
 *   email      — agent's email address
 *   type       — agent role type (e.g. "admin", "agent")
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTawkToAgent {
  _id?: string
  id?: string | number
  fullName?: string
  name?: string
  email?: string
  type?: string
  role?: string
  [key: string]: unknown
}

export function transformUser(raw: RawTawkToAgent): User {
  const id = pickStr(raw._id) ?? pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.fullName) ?? pickStr(raw.name) ?? '',
    role: pickStr(raw.type) ?? pickStr(raw.role),
    teamIds: [],
    platform: 'tawk-to',
    metadata: strMap({}),
    raw,
  }
}
