/**
 * Transform Sprinklr Service accessible user → canonical User (agent).
 *
 * Users are fetched via GET /api/v1/bootstrap/resources?types=ACCESSIBLE_USERS.
 * Key fields: id, name, email, role, profileImageUrl, queues (for teamIds)
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSprinklrUser {
  id?: string | number
  name?: string
  email?: string
  /** ADMIN / REPORTING / AGENT / etc. */
  role?: string
  profileImageUrl?: string | null
  /** Queue IDs the user belongs to */
  queues?: Array<string | number>
  [key: string]: unknown
}

export function transformUser(raw: RawSprinklrUser): User {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: (raw.queues ?? []).map(String),
    platform: 'sprinklr-service',
    metadata: strMap({}),
    raw,
  }
}
