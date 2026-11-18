import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawDriftGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawDriftGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'drift',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
