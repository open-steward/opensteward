/**
 * Supportbench division → canonical Team transform.
 *
 * Supportbench organises agents into "divisions" (not "groups" or "teams").
 * Division fields appear embedded on case responses as division_id + division
 * (display name). The canonical Team entity maps division_id → id.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSupportbenchDivision {
  id?: number | string | null
  name?: string | null
  description?: string | null
  active?: boolean | null
  [key: string]: unknown
}

export function transformTeam(raw: RawSupportbenchDivision): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'supportbench',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
