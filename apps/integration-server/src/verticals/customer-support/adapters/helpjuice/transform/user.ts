/**
 * Transform a Helpjuice user (agent/admin role) into the canonical User shape.
 *
 * role_id in Helpjuice maps to access level:
 *   1 = viewer/reader, 2 = contributor/editor, 3+ = admin / super-admin
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'
import type { RawHelpjuiceUser } from './contact'

function roleLabel(roleId: number | null | undefined): string | undefined {
  switch (roleId) {
    case 1: return 'viewer'
    case 2: return 'contributor'
    case 3: return 'admin'
    case 4: return 'super_admin'
    default: return roleId != null ? String(roleId) : undefined
  }
}

// Re-export so index.ts can use a single type for all user shapes
export type { RawHelpjuiceUser as RawHelpjuiceAgent }

export function transformUser(raw: RawHelpjuiceUser): User {
  const name = raw.name ?? [raw.first_name, raw.last_name].filter(Boolean).join(' ') ?? ''
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(name) ?? '',
    role: roleLabel(raw.role_id),
    teamIds: [],
    platform: 'helpjuice',
    metadata: strMap({ roleId: raw.role_id }),
    raw,
  }
}
