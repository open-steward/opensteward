import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreshdeskGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawFreshdeskGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'freshdesk',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
