import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHiverGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawHiverGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'hiver',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
