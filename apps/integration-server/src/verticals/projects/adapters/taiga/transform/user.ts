/**
 * Taiga user transform.
 *
 * Users are retrieved via:
 *   GET /users/{id}                 — single user
 *   GET /memberships?project={id}   — a project's members (membership detail objects)
 *
 * The canonical User only needs id, name, email, and workspaceIds.
 *
 * Docs: https://docs.taiga.io/api.html#users
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTaigaUser {
  id: number
  username?: string
  full_name?: string
  full_name_display?: string
  email?: string
  bio?: string
  lang?: string
  timezone?: string
  is_active?: boolean
  [key: string]: unknown
}

export function transformUser(raw: RawTaigaUser, workspaceId?: string): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.full_name_display ?? raw.full_name ?? raw.username) ?? '',
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'taiga',
    metadata: strMap({ username: raw.username }),
    raw,
  }
}

/**
 * A "membership detail" object from GET /memberships (docs.taiga.io/api.html,
 * section "Membership detail"). `user` is null on a pending invitation
 * (taiga-back projects/models.py: "stores invitations to memberships that does
 * not have assigned user"). `user_email` is sent only to project admins
 * (taiga-back MembershipAdminSerializer).
 */
export interface RawTaigaMembership {
  id: number
  user: number | null
  project: number
  full_name?: string | null
  user_email?: string | null
  role?: number
  role_name?: string | null
  is_admin?: boolean
  is_owner?: boolean
  is_user_active?: boolean
  [key: string]: unknown
}

/** The member a project membership names, as a canonical User keyed by the user id. */
export function transformMembershipUser(raw: RawTaigaMembership, projectId: string): User {
  if (raw.user == null) {
    throw new Error(`taiga: membership ${raw.id} is a pending invitation, not a user`)
  }
  if (typeof raw.full_name !== 'string') {
    throw new Error(`taiga: membership ${raw.id} has no full_name`)
  }
  return {
    id: String(raw.user),
    externalId: String(raw.user),
    email: pickStr(raw.user_email),
    name: raw.full_name,
    workspaceIds: [projectId],
    platform: 'taiga',
    metadata: strMap({
      membershipId: raw.id,
      projectId: raw.project,
      role: raw.role_name,
      isAdmin: raw.is_admin,
      isOwner: raw.is_owner,
      isUserActive: raw.is_user_active,
    }),
    raw,
  }
}
