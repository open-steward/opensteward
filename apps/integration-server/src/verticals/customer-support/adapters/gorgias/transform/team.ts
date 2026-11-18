import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGorgiasGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawGorgiasGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'gorgias',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
