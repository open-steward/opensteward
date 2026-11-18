import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Chaport operator object returned by GET /operators and GET /operators/:id.
 */
export interface RawChaportOperator {
  id: string
  email?: string
  name?: string
  language?: string
  jobTitle?: string
  role?: string
  lastLoginAt?: string
  emailConfirmedAt?: string
  lastActivityAt?: string
  image?: string
  lastStatus?: string
  realStatus?: string
  [key: string]: unknown
}

export function transformUser(raw: RawChaportOperator): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: [],
    platform: 'chaport',
    metadata: strMap({
      jobTitle: raw.jobTitle,
      language: raw.language,
      lastStatus: raw.lastStatus,
      realStatus: raw.realStatus,
      lastLoginAt: toIso(raw.lastLoginAt),
      lastActivityAt: toIso(raw.lastActivityAt),
    }),
    raw,
  }
}
