/**
 * Transform an Olark group into the canonical Team shape.
 *
 * Olark group fields (from GET /api/v1/groups):
 *   id, name
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOlarkGroup {
  id: string
  name?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawOlarkGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'olark',
    metadata: strMap({}),
    raw,
  }
}
