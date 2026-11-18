import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCrispGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawCrispGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'crisp',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
