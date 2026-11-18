/**
 * Zammad group-as-team transform.
 *
 * Endpoint: GET /api/v1/groups
 *           GET /api/v1/groups/{id}
 *
 * Docs: https://docs.zammad.org/en/latest/api/group.html
 */
import type { Team } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawZammadGroup {
  id: number
  name?: string
  note?: string | null
  active?: boolean
  assignment_timeout?: number | null
  follow_up_possible?: string | null
  created_at?: string
  updated_at?: string
  user_ids?: number[]
  [key: string]: unknown
}

export function transformTeam(raw: RawZammadGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'zammad',
    metadata: strMap({
      note: raw.note,
      active: raw.active,
      followUpPossible: raw.follow_up_possible,
      createdAt: toIso(raw.created_at),
      updatedAt: toIso(raw.updated_at),
    }),
    raw,
  }
}
