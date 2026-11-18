import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTrengoGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawTrengoGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'trengo',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
