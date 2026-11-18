/**
 * Transform a raw HaloPSA Team to the canonical Team shape.
 *
 * HaloPSA wire fields for Team objects:
 *   id              — integer team ID
 *   name            — team display name
 *   guid            — UUID (internal)
 *   sequence        — sort order
 *   department_id   — department assignment
 *   department_name — department display name
 *   inactive        — boolean (true = disabled)
 *   ticket_count    — current open ticket count
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHaloPsaTeam {
  id: number
  name?: string | null
  guid?: string | null
  department_id?: number | null
  department_name?: string | null
  inactive?: boolean | null
  ticket_count?: number | null
  [key: string]: unknown
}

export function transformTeam(raw: RawHaloPsaTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'halopsa',
    metadata: strMap({
      department_id: raw.department_id,
      department_name: raw.department_name,
      inactive: raw.inactive,
    }),
    raw,
  }
}
