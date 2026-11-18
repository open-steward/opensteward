/**
 * Transform a Perdoo User → canonical User.
 *
 * Perdoo users are account-wide (not scoped to a group), so `workspaceIds`
 * is always empty unless a caller supplies a groupId for scoping.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawPerdooUser {
  id: string
  name?: string
  email?: string
  role?: string | null
  isActive?: boolean | null
  [key: string]: unknown
}

export function transformUser(raw: RawPerdooUser, groupId?: string): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    workspaceIds: groupId ? [groupId] : [],
    platform: 'perdoo',
    metadata: strMap({
      role: raw.role,
      isActive: raw.isActive,
    }),
    raw,
  }
}
