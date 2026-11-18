import type { User } from '../../../schema'
import { strMap } from './shared'

/**
 * NocoDB workspace user maps to a canonical User.
 *
 * Response from GET /api/v2/meta/workspaces/{workspaceId}/users
 * ("Workspace users list ☁"), whose `WorkspaceUserList.list` items are
 * `WorkspaceUser` — documented properties exactly `email`, `fk_user_id`,
 * `invite_accepted`, `invite_token` and `roles` (NocoDB's OpenAPI,
 * https://raw.githubusercontent.com/nocodb/nocodb/develop/packages/nocodb/src/schema/swagger-v2.json).
 *
 * There is no documented display-name property, so the name is the user's
 * email, the only documented identity. `invite_token` is a credential and is
 * kept out of `raw`.
 */
export interface RawNocodbWorkspaceUser {
  email?: string
  fk_user_id?: string
  invite_accepted?: boolean
  invite_token?: string
  roles?: string
  [key: string]: unknown
}

export function transformUser(raw: RawNocodbWorkspaceUser, workspaceId: string): User {
  const { invite_token: _inviteToken, ...rest } = raw
  if (typeof raw.fk_user_id !== 'string' || raw.fk_user_id === '') {
    throw new Error('NocoDB workspace user has no fk_user_id')
  }
  if (typeof raw.email !== 'string' || raw.email === '') {
    throw new Error(`NocoDB workspace user ${raw.fk_user_id} has no email`)
  }
  return {
    id: raw.fk_user_id,
    externalId: raw.fk_user_id,
    email: raw.email,
    name: raw.email,
    workspaceIds: [workspaceId],
    platform: 'nocodb',
    metadata: strMap({ roles: raw.roles, inviteAccepted: raw.invite_accepted }),
    raw: rest,
  }
}
