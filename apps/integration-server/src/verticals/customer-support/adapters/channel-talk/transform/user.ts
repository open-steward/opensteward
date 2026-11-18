/**
 * Transform a raw Channel Talk Manager into a canonical User (agent).
 *
 * Channel Talk Manager fields:
 *   id               — string
 *   channelId        — tenant channel ID
 *   name             — display name
 *   description      — bio / description
 *   statusEmoji      — emoji status (ignored)
 *   email            — optional email from profile
 *   teamIds          — array of team IDs the manager belongs to
 *   operatorState    — "idle" | "active" | etc. (ignored, not in schema)
 *   receiveUnassignedChatAlert — bool (replaces legacy 'operator' field)
 *   createdAt        — epoch ms
 *
 * Docs: https://developers.channel.io/docs/list-of-managers
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawChannelTalkManager {
  id: string
  channelId?: string
  name?: string
  description?: string | null
  email?: string | null
  teamIds?: string[]
  operatorState?: string | null
  receiveUnassignedChatAlert?: boolean
  createdAt?: number
  [key: string]: unknown
}

export function transformUser(raw: RawChannelTalkManager): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: 'manager',
    teamIds: raw.teamIds ?? [],
    platform: 'channel-talk',
    metadata: strMap({
      channelId: raw.channelId,
      operatorState: raw.operatorState,
    }),
    raw,
  }
}
