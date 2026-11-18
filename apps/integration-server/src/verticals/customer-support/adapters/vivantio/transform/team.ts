/**
 * Vivantio Group → canonical Team transform.
 *
 * Vivantio's /api/Configuration/GroupSelectAll returns Group objects.
 * Fields: Id, Name, Email.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawVivantioGroup {
  Id: number
  Name?: string | null
  Email?: string | null
  [key: string]: unknown
}

export function transformTeam(raw: RawVivantioGroup): Team {
  return {
    id: String(raw.Id),
    externalId: String(raw.Id),
    name: pickStr(raw.Name) ?? '',
    platform: 'vivantio',
    metadata: strMap({ email: raw.Email }),
    raw,
  }
}
