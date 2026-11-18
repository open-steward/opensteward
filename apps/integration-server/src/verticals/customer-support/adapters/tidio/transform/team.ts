import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTidioGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawTidioGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'tidio',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
