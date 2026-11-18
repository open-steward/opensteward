/**
 * Transform an Unthread user object into the canonical User schema.
 *
 * Unthread users are agents (workspace members). The API returns them from
 * POST /users/list. No explicit role field is present; slackId is surfaced
 * in metadata.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUnthreadUser {
  id: string
  name?: string | null
  email?: string | null
  slackId?: string | null
  photo?: string | null
  customFields?: Record<string, unknown> | null
  [key: string]: unknown
}

export function transformUser(raw: RawUnthreadUser): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: undefined,
    teamIds: [],
    platform: 'unthread',
    metadata: strMap({ slackId: raw.slackId }),
    raw,
  }
}
