/**
 * Transform a Five9 SCIM Group into a canonical Team.
 *
 * Five9 uses SCIM Groups to represent skill-groups in the Virtual Contact
 * Center. Each group can have agents as members.
 *
 * Five9 SCIM Group shape (RFC 7643):
 *   id          — opaque string identifier
 *   displayName — human-readable group name
 *   members[]   — array of { value: userId, display: userName }
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

interface ScimMember {
  value?: string
  display?: string
  [key: string]: unknown
}

export interface RawFive9ScimGroup {
  id?: string
  externalId?: string | null
  displayName?: string
  members?: ScimMember[]
  [key: string]: unknown
}

export function transformTeam(raw: RawFive9ScimGroup): Team {
  const id = pickStr(raw.id) ?? pickStr(raw.externalId) ?? pickStr(raw.displayName) ?? ''
  const memberCount = Array.isArray(raw.members) ? raw.members.length : undefined
  return {
    id,
    externalId: pickStr(raw.externalId) ?? id,
    name: pickStr(raw.displayName) ?? '',
    memberCount,
    platform: 'five9',
    metadata: strMap({
      externalId: pickStr(raw.externalId) ?? id,
      memberCount,
    }),
    raw,
  }
}
