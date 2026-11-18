/**
 * Transform a Helpjuice group into the canonical Team shape.
 *
 * Groups in Helpjuice organise users and control content access.
 * smart_load and auto_groups are metadata-only.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpjuiceGroup {
  id: number
  name?: string | null
  smart_load?: boolean
  auto_groups?: unknown[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawHelpjuiceGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'helpjuice',
    metadata: strMap({
      smartLoad: raw.smart_load,
    }),
    raw,
  }
}
