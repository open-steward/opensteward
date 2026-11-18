/**
 * TeamSupport user (agent) transform.
 *
 * TeamSupport user fields from /api/json/users.json:
 *   ID, FirstName, LastName, Email, DefaultSupportGroupID (team),
 *   AdminLevel, IsActive, DateCreated.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTeamsupportUser {
  ID?: number | string
  FirstName?: string | null
  LastName?: string | null
  Email?: string | null
  DefaultSupportGroupID?: number | string | null
  AdminLevel?: string | null
  IsActive?: boolean | string
  DateCreated?: string | null
  [key: string]: unknown
}

function buildName(raw: RawTeamsupportUser): string {
  const first = pickStr(raw.FirstName) ?? ''
  const last = pickStr(raw.LastName) ?? ''
  const full = [first, last].filter(Boolean).join(' ')
  return full || ''
}

export function transformUser(raw: RawTeamsupportUser): User {
  return {
    id: String(raw.ID ?? ''),
    externalId: String(raw.ID ?? ''),
    email: pickStr(raw.Email),
    name: buildName(raw),
    role: pickStr(raw.AdminLevel),
    teamIds: raw.DefaultSupportGroupID != null ? [String(raw.DefaultSupportGroupID)] : [],
    platform: 'teamsupport',
    metadata: strMap({ IsActive: raw.IsActive }),
    raw,
  }
}
