import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFrontGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawFrontGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'front',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
