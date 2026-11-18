/**
 * Freshservice agent group (team) transform.
 *
 * Freshservice agent groups are used to route and manage tickets.
 * Key fields: id, name, description, created_at, updated_at.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreshserviceGroup {
  id: number
  name?: string
  description?: string | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawFreshserviceGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'freshservice',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
