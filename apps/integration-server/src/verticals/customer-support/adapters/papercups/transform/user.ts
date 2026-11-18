/**
 * Papercups user → canonical User transform.
 *
 * API: GET /api/v1/me (authenticated user only)
 * Response envelope: { data: RawPapercupsUser }
 *
 * Papercups does not expose a multi-user list endpoint in its public API.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPapercupsUser {
  id: string
  account_id?: string
  email?: string
  display_name?: string | null
  full_name?: string | null
  role?: string
  [key: string]: unknown
}

export function transformUser(raw: RawPapercupsUser): User {
  const name = pickStr(raw.full_name) ?? pickStr(raw.display_name) ?? pickStr(raw.email) ?? ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email) as string | undefined,
    name,
    role: pickStr(raw.role),
    teamIds: [],
    platform: 'papercups',
    metadata: strMap({
      accountId: raw.account_id,
    }),
    raw,
  }
}
