/**
 * Zammad user-as-agent transform.
 *
 * Agents are Zammad users who have ticket.agent (or admin) role_ids.
 * Endpoint: GET /api/v1/users  (same endpoint as contacts)
 *           GET /api/v1/users/{id}
 *
 * Docs: https://docs.zammad.org/en/latest/api/user.html
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import type { RawZammadUser } from './contact'

export type { RawZammadUser as RawZammadAgent }

function fullName(raw: RawZammadUser): string {
  const first = pickStr(raw.firstname) ?? ''
  const last = pickStr(raw.lastname) ?? ''
  const full = [first, last].filter(Boolean).join(' ')
  return full || (pickStr(raw.login) ?? '')
}

/**
 * Derive team IDs from group_ids map.
 * Zammad returns group_ids as { "<groupId>": ["full", "read", ...] } or an array.
 */
function extractGroupIds(raw: RawZammadUser): string[] {
  if (!raw.group_ids) return []
  if (typeof raw.group_ids === 'object' && !Array.isArray(raw.group_ids)) {
    return Object.keys(raw.group_ids)
  }
  if (Array.isArray(raw.group_ids)) {
    return (raw.group_ids as unknown[]).map(String)
  }
  return []
}

export function transformUser(raw: RawZammadUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: fullName(raw),
    role: pickStr(raw.login), // Zammad has no single role string; use login as stable identifier
    teamIds: extractGroupIds(raw),
    platform: 'zammad',
    metadata: strMap({
      login: raw.login,
      active: raw.active,
      department: raw.department,
      lastLogin: toIso(raw.last_login),
      createdAt: toIso(raw.created_at),
      updatedAt: toIso(raw.updated_at),
    }),
    raw,
  }
}
