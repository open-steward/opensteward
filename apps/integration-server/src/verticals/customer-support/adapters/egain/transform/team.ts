/**
 * Transform an eGain Group (team) into the canonical OpenSteward Team schema.
 *
 * eGain Group endpoint: GET /ws/v12/administration/group
 * Schema documented at:
 *   https://hd.egain.com/api/authoring_interaction_api_reference/html/de/da5/
 *   classadministration_1_1pages_1_1group_1_1examples_1_1_group_search_examples.html
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw eGain group object as returned by GET /ws/v12/administration/group.
 */
export interface RawEgainGroup {
  id: number | string
  name?: string
  department?: {
    id?: number | string
    name?: string
  }
  [key: string]: unknown
}

export function transformTeam(raw: RawEgainGroup): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'egain',
    metadata: strMap({
      departmentId: raw.department?.id,
      departmentName: raw.department?.name,
    }),
    raw,
  }
}
