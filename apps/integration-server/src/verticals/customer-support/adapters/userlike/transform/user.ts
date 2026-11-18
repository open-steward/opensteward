/**
 * Transform a Userlike operator object into the canonical User shape.
 *
 * Operator roles: "m" = Manager, "a" = Agent, "s" = Staff.
 * operator_group is a nested object with id + name (no standalone groups endpoint).
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUserlikeOperator {
  id: number
  name?: string
  display_name?: string | null
  email?: string
  first_name?: string | null
  last_name?: string | null
  role?: string
  enabled?: boolean
  is_active?: boolean
  um_away?: boolean
  operator_group?: { id?: number; name?: string } | null
  timezone?: string | null
  locale?: string | null
  [key: string]: unknown
}

function mapRole(role: string | undefined): string {
  if (role === 'm') return 'manager'
  if (role === 'a') return 'agent'
  if (role === 's') return 'staff'
  return role ?? 'agent'
}

export function transformUser(raw: RawUserlikeOperator): User {
  const groupId = raw.operator_group?.id != null ? String(raw.operator_group.id) : undefined
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.display_name) ?? pickStr(raw.name) ?? '',
    role: mapRole(raw.role),
    teamIds: groupId ? [groupId] : [],
    platform: 'userlike',
    metadata: strMap({
      first_name: raw.first_name,
      last_name: raw.last_name,
      enabled: raw.enabled,
      is_active: raw.is_active,
      um_away: raw.um_away,
      timezone: raw.timezone,
      locale: raw.locale,
      operator_group_name: raw.operator_group?.name,
    }),
    raw,
  }
}
