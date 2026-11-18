import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawChatwootGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawChatwootGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'chatwoot',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
