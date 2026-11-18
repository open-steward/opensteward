/**
 * Freshservice agent (user) transform.
 *
 * Key fields: id, first_name, last_name, email, phone,
 *   group_memberships (array of { id, group_id, ... }),
 *   roles (array of { id, role_id, assignment_scope }),
 *   created_at, updated_at.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

interface GroupMembership {
  id?: number
  group_id?: number
  [key: string]: unknown
}

interface RoleAssignment {
  id?: number
  role_id?: number
  assignment_scope?: string
  [key: string]: unknown
}

export interface RawFreshserviceAgent {
  id: number
  first_name?: string
  last_name?: string | null
  email?: string
  phone?: string | null
  /** Current group memberships */
  group_memberships?: GroupMembership[]
  /** Role assignments */
  roles?: RoleAssignment[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformUser(raw: RawFreshserviceAgent): User {
  const firstName = pickStr(raw.first_name) ?? ''
  const lastName = pickStr(raw.last_name)
  const name = lastName ? `${firstName} ${lastName}`.trim() : firstName
  const teamIds = (raw.group_memberships ?? [])
    .map((m) => m.group_id ? String(m.group_id) : undefined)
    .filter((id): id is string => id !== undefined)
  // Derive a role label from the first role assignment scope if available
  const role = raw.roles && raw.roles.length > 0
    ? pickStr(raw.roles[0]?.assignment_scope)
    : undefined
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name,
    role,
    teamIds,
    platform: 'freshservice',
    metadata: strMap({}),
    raw,
  }
}
