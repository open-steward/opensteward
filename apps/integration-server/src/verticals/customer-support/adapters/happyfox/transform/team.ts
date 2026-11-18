import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHappyFoxGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawHappyFoxGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'happyfox',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
