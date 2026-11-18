/**
 * FreeScout user (agent) -> canonical User transform.
 *
 * FreeScout user fields (camelCase in API responses):
 *   id, firstName, lastName, email, role (admin | user), mailboxes[]
 *
 * FreeScout does not have a concept of teams per-se; the agent can belong to
 * mailboxes.  We map mailbox ids to teamIds for structural parity.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreescoutUser {
  id: number
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  role?: string | null
  mailboxes?: Array<{ id?: number }> | null
  [key: string]: unknown
}

function fullName(raw: RawFreescoutUser): string {
  const parts = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean)
  return parts.join(' ') || ''
}

export function transformUser(raw: RawFreescoutUser): User {
  const mailboxIds = (raw.mailboxes ?? [])
    .map((m) => m.id)
    .filter((id): id is number => id != null)
    .map(String)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName(raw),
    role: pickStr(raw.role),
    teamIds: mailboxIds,
    platform: 'freescout',
    metadata: strMap({}),
    raw,
  }
}
