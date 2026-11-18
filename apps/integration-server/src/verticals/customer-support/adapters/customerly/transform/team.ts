import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawCustomerlyGroup {
  id: number
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawCustomerlyGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'customerly',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
