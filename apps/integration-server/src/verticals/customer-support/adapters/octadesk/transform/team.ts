/**
 * Transform Octadesk group to canonical Team.
 *
 * Octadesk groups are returned by GET /tickets/groups.
 * Fields: id, name, description (not always present)
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOctadeskGroup {
  /** Group UUID */
  id?: string
  name?: string
  description?: string
  [key: string]: unknown
}

export function transformTeam(raw: RawOctadeskGroup): Team {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    name: pickStr(raw.name) ?? '',
    platform: 'octadesk',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
