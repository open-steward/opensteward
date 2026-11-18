/**
 * LiveHelpNow operator → canonical User transform.
 *
 * Operators come from GET /api/departments?include_operators=true
 * (nested under each department's `operators` array).
 *
 * Transforms NEVER throw; missing optional fields return undefined.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Shape of an operator entry from GET /api/departments?include_operators=true */
export interface RawLivehelpnowOperator {
  id: number
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  username?: string | null
  admin?: boolean
  enabled?: boolean
  online?: boolean
  description?: string | null
  picture?: string | null
  /** Department ID this operator was found under — injected during transform. */
  _departmentId?: string
  [key: string]: unknown
}

export function transformUser(raw: RawLivehelpnowOperator): User {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name) ?? ''
  const name = [firstName, lastName].filter(Boolean).join(' ') || (pickStr(raw.username) ?? '')

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name,
    role: raw.admin ? 'admin' : 'agent',
    teamIds: raw._departmentId ? [raw._departmentId] : [],
    platform: 'livehelpnow',
    metadata: strMap({
      username: raw.username,
      enabled: raw.enabled,
      online: raw.online,
    }),
    raw,
  }
}
