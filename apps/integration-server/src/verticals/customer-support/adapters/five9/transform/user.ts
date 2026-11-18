/**
 * Transform a Five9 SCIM User into a canonical User (agent).
 *
 * In Five9, agents are provisioned and managed via SCIM. The SCIM User
 * object's `groups` array contains the skill-groups (teams) the agent belongs to.
 *
 * Five9 SCIM User shape (RFC 7643 + Five9 extensions):
 *   id            — opaque string identifier
 *   userName      — usually the agent's email address
 *   name.formatted           — display name
 *   name.givenName / familyName
 *   emails[].value / primary — email addresses
 *   groups[].value           — skill-group (team) IDs this agent is a member of
 *   roles / urn:ietf:params:scim:schemas:extension:five9:2.0:User
 *                            — Five9-specific role info
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

interface ScimName {
  formatted?: string
  givenName?: string
  familyName?: string
  [key: string]: unknown
}

interface ScimEmail {
  value?: string
  primary?: boolean
  [key: string]: unknown
}

interface ScimGroup {
  value?: string
  display?: string
  [key: string]: unknown
}

interface ScimRole {
  value?: string
  primary?: boolean
  [key: string]: unknown
}

export interface RawFive9ScimAgent {
  id?: string
  externalId?: string | null
  userName?: string
  name?: ScimName
  emails?: ScimEmail[]
  groups?: ScimGroup[]
  roles?: ScimRole[]
  active?: boolean
  [key: string]: unknown
}

function pickEmail(raw: RawFive9ScimAgent): string | undefined {
  const emails = raw.emails ?? []
  const primary = emails.find((e) => e.primary)
  const first = emails[0]
  return pickStr(primary?.value) ?? pickStr(first?.value) ?? pickStr(raw.userName)
}

function pickName(raw: RawFive9ScimAgent): string {
  if (raw.name?.formatted) return raw.name.formatted
  const parts = [raw.name?.givenName, raw.name?.familyName].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return pickStr(raw.userName) ?? ''
}

function pickRole(raw: RawFive9ScimAgent): string | undefined {
  const roles = raw.roles ?? []
  const primary = roles.find((r) => r.primary)
  return pickStr(primary?.value) ?? pickStr(roles[0]?.value)
}

export function transformUser(raw: RawFive9ScimAgent): User {
  const id = pickStr(raw.id) ?? pickStr(raw.externalId) ?? pickStr(raw.userName) ?? ''
  const teamIds = (raw.groups ?? [])
    .map((g) => pickStr(g.value))
    .filter((v): v is string => v !== undefined)

  return {
    id,
    externalId: pickStr(raw.externalId) ?? id,
    email: pickEmail(raw),
    name: pickName(raw),
    role: pickRole(raw) ?? (raw.active === false ? 'inactive' : 'agent'),
    teamIds,
    platform: 'five9',
    metadata: strMap({ userName: raw.userName, active: raw.active }),
    raw,
  }
}
