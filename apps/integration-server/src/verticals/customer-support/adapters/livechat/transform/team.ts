import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawLiveChatGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawLiveChatGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'livechat',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
