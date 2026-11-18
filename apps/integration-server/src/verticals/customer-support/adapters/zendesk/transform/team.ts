import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZendeskGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawZendeskGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'zendesk',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
