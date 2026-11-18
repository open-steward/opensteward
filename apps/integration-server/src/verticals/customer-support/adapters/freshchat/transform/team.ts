/**
 * Transform a Freshchat group into the canonical Team schema.
 *
 * Freshchat groups are agent teams that can be assigned to conversations.
 * GET /v2/groups returns { groups: [...] }
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreshchatGroup {
  id: string
  name?: string
  description?: string | null
  created_time?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawFreshchatGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'freshchat',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
