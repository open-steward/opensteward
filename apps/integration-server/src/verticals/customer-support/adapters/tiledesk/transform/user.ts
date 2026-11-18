/**
 * Tiledesk team-member (agent/user) transform.
 *
 * GET /v3/:project_id/project_users
 * The response wraps the user in `id_user`; the project membership is the
 * outer object. We surface the combined view.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Nested user object inside a project_user record */
export interface RawTiledeskUserInner {
  _id?: string
  email?: string
  firstname?: string
  lastname?: string
  [key: string]: unknown
}

/** Full project_user record returned by the team endpoint */
export interface RawTiledeskProjectUser {
  _id?: string
  id_user?: RawTiledeskUserInner | string | null
  role?: string
  user_available?: boolean
  status?: string | number
  id_project?: string
  [key: string]: unknown
}

export function transformUser(raw: RawTiledeskProjectUser): User {
  const inner: RawTiledeskUserInner =
    typeof raw.id_user === 'object' && raw.id_user !== null
      ? raw.id_user
      : {}

  const userId =
    pickStr(inner._id) ??
    (typeof raw.id_user === 'string' ? raw.id_user : undefined) ??
    pickStr(raw._id) ??
    ''

  const firstname = pickStr(inner.firstname) ?? ''
  const lastname  = pickStr(inner.lastname) ?? ''
  const name = [firstname, lastname].filter(Boolean).join(' ') || userId

  return {
    id: userId,
    externalId: userId,
    email: pickStr(inner.email),
    name,
    role: pickStr(raw.role),
    teamIds: [],   // Tiledesk project_users are not grouped at this level
    platform: 'tiledesk',
    metadata: strMap({
      userAvailable: raw.user_available,
      status: raw.status,
      projectMembershipId: raw._id,
    }),
    raw,
  }
}
