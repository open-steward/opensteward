import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKustomerGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawKustomerGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'kustomer',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
