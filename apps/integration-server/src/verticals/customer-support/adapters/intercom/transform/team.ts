/**
 * Intercom team → canonical Team. Fields: the `team` schema of the 2.16
 * OpenAPI description ("Teams are groups of admins in Intercom.").
 * https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawIntercomTeam {
  type?: string
  id: string | number
  name?: string | null
  /** "The list of admin IDs that are a part of the team." */
  admin_ids?: Array<number | string> | null
  distribution_method?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawIntercomTeam): Team {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    memberCount: Array.isArray(raw.admin_ids) ? raw.admin_ids.length : undefined,
    platform: 'intercom',
    metadata: strMap({ distributionMethod: raw.distribution_method }),
    raw,
  }
}
