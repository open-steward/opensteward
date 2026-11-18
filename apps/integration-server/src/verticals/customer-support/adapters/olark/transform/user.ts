/**
 * Transform an Olark operator (agent) into the canonical User shape.
 *
 * Olark operator fields (from GET /api/v1/operators):
 *   id, username, nickname, emailAddress, group_ids, available
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOlarkOperator {
  id: string
  username?: string
  nickname?: string
  emailAddress?: string
  group_ids?: string[]
  available?: boolean
  [key: string]: unknown
}

export function transformUser(raw: RawOlarkOperator): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.emailAddress),
    name: pickStr(raw.nickname) ?? pickStr(raw.username) ?? '',
    role: 'agent',
    teamIds: raw.group_ids ? raw.group_ids.map(String) : [],
    platform: 'olark',
    metadata: strMap({
      username: raw.username,
      available: raw.available,
    }),
    raw,
  }
}
