/**
 * UseDesk group (team) transform.
 *
 * Groups are retrieved via POST /uapi/groups.
 * The response contains group objects with id and name.
 *
 * Docs: https://api.usedocs.com/
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUsedeskGroup {
  id?: number | string
  name?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawUsedeskGroup): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'usedesk',
    metadata: strMap({}),
    raw,
  }
}
