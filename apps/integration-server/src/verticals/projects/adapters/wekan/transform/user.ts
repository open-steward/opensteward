/**
 * Wekan user → canonical User.
 *
 * User fields (from GET /api/users or GET /api/users/:userId):
 *   _id, username, emails[]{address,verified}, profile{fullname},
 *   isAdmin, loginDisabled, createdAt, modifiedAt
 */
import type { User } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'
import { VIRTUAL_WORKSPACE_ID } from '../constants'

export interface RawWekanUser {
  _id: string
  username?: string
  emails?: Array<{ address?: string; verified?: boolean }>
  profile?: { fullname?: string; initials?: string; avatarUrl?: string }
  isAdmin?: boolean
  loginDisabled?: boolean
  createdAt?: string
  modifiedAt?: string
  [key: string]: unknown
}

export function transformUser(raw: RawWekanUser): User {
  const primaryEmail = raw.emails?.[0]?.address
  const displayName =
    pickStr(raw.profile?.fullname) ?? pickStr(raw.username) ?? ''

  return {
    id: raw._id,
    externalId: raw._id,
    email: pickStr(primaryEmail),
    name: displayName,
    workspaceIds: [VIRTUAL_WORKSPACE_ID],
    platform: 'wekan',
    metadata: strMap({
      username: raw.username,
      isAdmin: raw.isAdmin,
      loginDisabled: raw.loginDisabled,
      createdAt: toIso(raw.createdAt),
    }),
    raw,
  }
}
