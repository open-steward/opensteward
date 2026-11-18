import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGrooveGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawGrooveGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'groove',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
