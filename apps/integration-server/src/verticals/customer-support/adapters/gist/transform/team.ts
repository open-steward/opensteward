import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawGistGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawGistGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'gist',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
