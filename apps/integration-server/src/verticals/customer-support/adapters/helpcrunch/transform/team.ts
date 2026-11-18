import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpCrunchGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawHelpCrunchGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'helpcrunch',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
